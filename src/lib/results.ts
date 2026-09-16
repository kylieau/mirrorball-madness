import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { computeGrandFinalePoints, computeWeeklyScores, type GrandFinaleMethod, type Outcome } from "@/lib/scoring";

const RESOLVING_OUTCOMES = new Set<Outcome>(["eliminated", "withdrawn", "winner", "runner_up", "third_place"]);

export type JudgeScoreSubmission = { judgeId: string; score: number };

export type DanceSubmission = {
  danceStyleId: string;
  songTitle: string | null;
  judgeScores: JudgeScoreSubmission[];
};

export type EntrySubmission = {
  coupleId: string;
  dances: DanceSubmission[];
  outcome: Outcome;
  savedByJudges: boolean;
  wasTeamDance: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

export type EpisodeResultsInput = {
  weekNumber: number;
  airsAt: string;
  theme: string | null;
  expectedDanceCount: number;
  entries: EntrySubmission[];
};

// While the league is small, results entry is opened to every signed-in user
// (RESULTS_ENTRY_OPEN_TO_ALL=true) rather than gated behind is_super_admin, so
// no single person is stuck updating scores every week. Flip the env var off
// once that trust assumption stops holding.
export function resultsEntryOpenToAll(): boolean {
  return process.env.RESULTS_ENTRY_OPEN_TO_ALL === "true";
}

async function getActiveSeasonId(
  admin: SupabaseClient<Database>
): Promise<{ seasonId: string | null; error: string | null }> {
  const { data: season, error } = await admin
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .single();
  return { seasonId: season?.id ?? null, error: error?.message ?? (season ? null : "No active season") };
}

export type ScheduleEpisodeInput = {
  weekNumber: number;
  airsAt: string;
  theme: string | null;
  isEliminationWeek: boolean;
  isFinale: boolean;
  isDoubleEliminationWeek: boolean;
  // Empty = unrestricted (every currently-active couple participates) — the
  // ordinary case. Only populated for a split-broadcast episode (e.g. a
  // two-night premiere where half the cast dances each night).
  participantCoupleIds: string[];
};

// Sets week/date/theme/elimination-week/finale/participants — everything
// known ahead of air — leaving expected_dance_count and status untouched on
// an existing episode, since those are owned by the results-entry flow below.
export async function applyEpisodeSchedule(
  admin: SupabaseClient<Database>,
  input: ScheduleEpisodeInput
): Promise<{ error: string | null }> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return { error: seasonErr };

  const { data: episode, error } = await admin
    .from("episodes")
    .upsert(
      {
        season_id: seasonId,
        week_number: input.weekNumber,
        airs_at: input.airsAt,
        theme: input.theme,
        is_elimination_week: input.isEliminationWeek,
        is_finale: input.isFinale,
        is_double_elimination_week: input.isDoubleEliminationWeek,
      },
      { onConflict: "season_id,week_number" }
    )
    .select()
    .single();
  if (error) return { error: error.message };

  // Full replace, same convention as dance_scores/episode_results below.
  await admin.from("episode_participants").delete().eq("episode_id", episode.id);
  if (input.participantCoupleIds.length > 0) {
    const { error: participantsErr } = await admin.from("episode_participants").insert(
      input.participantCoupleIds.map((coupleId) => ({ episode_id: episode.id, couple_id: coupleId }))
    );
    if (participantsErr) return { error: participantsErr.message };
  }

  return { error: null };
}

// Takes an already-authorized admin (service-role) client — the caller is
// responsible for verifying access (profiles.is_super_admin or
// resultsEntryOpenToAll()) first. Kept separate from the 'use server' action
// so it can be exercised directly in tests without a Next.js request context.
export async function applyEpisodeResults(
  admin: SupabaseClient<Database>,
  input: EpisodeResultsInput
): Promise<{ error: string | null }> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return { error: seasonErr };

  const { data: episode, error: episodeErr } = await admin
    .from("episodes")
    .upsert(
      {
        season_id: seasonId,
        week_number: input.weekNumber,
        airs_at: input.airsAt,
        theme: input.theme,
        expected_dance_count: input.expectedDanceCount,
        // Submitting with no couple entries just schedules the episode (sets
        // its air/lock time) ahead of air — that's how a manager gets
        // something to predict against before results exist. Adding entries
        // later flips it to completed.
        status: input.entries.length > 0 ? "completed" : "upcoming",
        results_published_at: input.entries.length > 0 ? new Date().toISOString() : null,
      },
      { onConflict: "season_id,week_number" }
    )
    .select()
    .single();

  if (episodeErr) return { error: episodeErr.message };

  // Correcting a published week can un-resolve a couple (e.g. an
  // elimination gets reversed) — read the old outcomes before they're
  // wiped below so any couple that's no longer resolving this time around
  // can be reverted to active, instead of being left permanently stuck on
  // a stale eliminated/withdrawn/winner/runner_up/third_place status.
  const { data: previousOutcomes } = await admin
    .from("episode_results")
    .select("couple_id, outcome")
    .eq("episode_id", episode.id);

  const previouslyResolvedIds = new Set(
    (previousOutcomes ?? [])
      .filter((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome))
      .map((r) => r.couple_id)
  );
  const nowResolvedIds = new Set(
    input.entries.filter((e) => RESOLVING_OUTCOMES.has(e.outcome)).map((e) => e.coupleId)
  );
  const revertedIds = [...previouslyResolvedIds].filter((id) => !nowResolvedIds.has(id));
  if (revertedIds.length > 0) {
    await admin.from("couples").update({ status: "active", elimination_week: null }).in("id", revertedIds);
  }

  // judge_scores cascades from dance_scores, so clearing dance_scores is enough.
  await admin.from("dance_scores").delete().eq("episode_id", episode.id);
  await admin.from("episode_results").delete().eq("episode_id", episode.id);

  // Inserted one dance at a time (not a bulk insert) so each dance_scores row's
  // real id is known before inserting its judge_scores — no reliance on
  // multi-row insert order lining up with the input array.
  const danceScoreInputs: { coupleId: string; totalScore: number }[] = [];
  for (const e of input.entries) {
    for (const dance of e.dances) {
      const totalScore = dance.judgeScores.reduce((sum, js) => sum + js.score, 0);
      const { data: danceScoreRow, error: danceErr } = await admin
        .from("dance_scores")
        .insert({
          episode_id: episode.id,
          couple_id: e.coupleId,
          dance_style_id: dance.danceStyleId,
          song_title: dance.songTitle,
          total_score: totalScore,
        })
        .select()
        .single();
      if (danceErr) return { error: danceErr.message };

      if (dance.judgeScores.length > 0) {
        const { error: judgeErr } = await admin.from("judge_scores").insert(
          dance.judgeScores.map((js) => ({
            dance_score_id: danceScoreRow.id,
            judge_id: js.judgeId,
            score: js.score,
          }))
        );
        if (judgeErr) return { error: judgeErr.message };
      }

      danceScoreInputs.push({ coupleId: e.coupleId, totalScore });
    }
  }

  const outcomeRows = input.entries.map((e) => ({
    episode_id: episode.id,
    couple_id: e.coupleId,
    outcome: e.outcome,
    saved_by_judges: e.savedByJudges,
    was_team_dance: e.wasTeamDance,
    had_immunity: e.hadImmunity,
    bonus_points: e.bonusPoints,
    bonus_note: e.bonusNote,
  }));
  if (outcomeRows.length > 0) {
    const { error } = await admin.from("episode_results").insert(outcomeRows);
    if (error) return { error: error.message };
  }

  for (const e of input.entries) {
    // eliminated/withdrawn open the roster slot for waivers; winner/runner_up/
    // third_place record the finale placement. safe and bye leave
    // couples.status untouched — a bye couple is still actively competing.
    if (e.outcome === "eliminated" || e.outcome === "withdrawn") {
      await admin
        .from("couples")
        .update({ status: e.outcome, elimination_week: input.weekNumber })
        .eq("id", e.coupleId);
    } else if (e.outcome === "winner" || e.outcome === "runner_up" || e.outcome === "third_place") {
      await admin.from("couples").update({ status: e.outcome, elimination_week: null }).eq("id", e.coupleId);
    }
  }

  const { data: leagues, error: leaguesErr } = await admin.from("leagues").select("id");
  if (leaguesErr) return { error: leaguesErr.message };

  const episodeOutcomeInputs = outcomeRows.map((r) => ({
    coupleId: r.couple_id,
    outcome: r.outcome,
    bonusPoints: r.bonus_points,
  }));

  // Grand Finale resolves incrementally: the moment a couple's real fate is
  // known (this episode's eliminations/withdrawals/podium placements), that
  // couple's predicted-vs-actual position is scored once and never again —
  // this is season-wide, not per-league, since "actual position" depends on
  // the full elimination order across every league's shared couples.
  const newlyResolvedCoupleIds = outcomeRows
    .filter((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome))
    .map((r) => r.couple_id);

  const actualPositionByCouple = new Map<string, number>();
  let totalCouples = 0;
  if (newlyResolvedCoupleIds.length > 0) {
    const { data: seasonCouples, error: seasonCouplesErr } = await admin
      .from("couples")
      .select("id, status, elimination_week")
      .eq("season_id", seasonId);
    if (seasonCouplesErr) return { error: seasonCouplesErr.message };

    totalCouples = (seasonCouples ?? []).length;

    // Dense rank by elimination_week: couples eliminated the same week (a
    // double-elimination) share a position, both scored against it.
    const eliminationWeeks = [
      ...new Set(
        (seasonCouples ?? [])
          .filter((c) => c.status === "eliminated" || c.status === "withdrawn")
          .map((c) => c.elimination_week!)
      ),
    ].sort((a, b) => a - b);
    const rankByWeek = new Map(eliminationWeeks.map((week, i) => [week, i + 1]));

    for (const couple of seasonCouples ?? []) {
      if (couple.status === "winner") actualPositionByCouple.set(couple.id, totalCouples);
      else if (couple.status === "runner_up") actualPositionByCouple.set(couple.id, totalCouples - 1);
      else if (couple.status === "third_place") actualPositionByCouple.set(couple.id, totalCouples - 2);
      else if (
        (couple.status === "eliminated" || couple.status === "withdrawn") &&
        couple.elimination_week !== null
      ) {
        actualPositionByCouple.set(couple.id, rankByWeek.get(couple.elimination_week)!);
      }
    }
  }

  for (const league of leagues ?? []) {
    const [{ data: scoringSettings }, { data: rosterSlots }, { data: predictions }] = await Promise.all([
      admin.from("scoring_settings").select("*").eq("league_id", league.id).single(),
      admin
        .from("roster_slots")
        .select("manager_id, couple_id")
        .eq("league_id", league.id)
        .lte("start_week", input.weekNumber)
        .or(`end_week.is.null,end_week.gte.${input.weekNumber}`),
      admin
        .from("predictions")
        .select("manager_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
        .eq("league_id", league.id)
        .eq("episode_id", episode.id),
    ]);

    if (!scoringSettings || !rosterSlots) continue;

    let grandFinalePointsByManager: Record<string, number> = {};
    if (newlyResolvedCoupleIds.length > 0) {
      const { data: grandFinalePredictions, error: gfpErr } = await admin
        .from("grand_finale_predictions")
        .select("manager_id, couple_id, predicted_position")
        .eq("league_id", league.id)
        .in("couple_id", newlyResolvedCoupleIds);
      if (gfpErr) return { error: gfpErr.message };

      grandFinalePointsByManager = computeGrandFinalePoints({
        predictions: (grandFinalePredictions ?? []).map((p) => ({
          managerId: p.manager_id,
          coupleId: p.couple_id,
          predictedPosition: p.predicted_position,
        })),
        resolvedCouples: newlyResolvedCoupleIds
          .filter((id) => actualPositionByCouple.has(id))
          .map((id) => ({ coupleId: id, actualPosition: actualPositionByCouple.get(id)! })),
        totalCouples,
        method: (scoringSettings.bonus_picks_scoring_method as GrandFinaleMethod) ?? "exact_position",
        distancePenalty: scoringSettings.bonus_picks_distance_penalty,
        tierSize: scoringSettings.bonus_picks_tier_size,
        pointsPerCorrect: scoringSettings.bonus_picks_points_per_correct,
      });
    }

    // A league's roster (and so its whole "Judges' Scores" category — dance
    // score, survival, podium, and bonus points all bundled into
    // rosterPoints below) doesn't start counting until the commissioner's
    // chosen starting week: before that, nobody had actually drafted yet, so
    // attributing any of it to a manager would be attributing it to a
    // roster that didn't exist. Pick 'Em predictions and Grand Finale points
    // are unaffected — those aren't roster-dependent.
    const judgesScoreStarted = input.weekNumber >= scoringSettings.judges_score_starts_week;

    const scores = computeWeeklyScores({
      scoringSettings: {
        judgesScoreMultiplier: scoringSettings.judges_score_multiplier,
        survivalPoints: scoringSettings.survival_points,
        eliminationPredictionPoints: scoringSettings.elimination_prediction_points,
        topScorerPredictionPoints: scoringSettings.top_scorer_prediction_points,
        firstPlacePoints: scoringSettings.first_place_points,
        secondPlacePoints: scoringSettings.second_place_points,
        thirdPlacePoints: scoringSettings.third_place_points,
      },
      rosterSlots: judgesScoreStarted
        ? rosterSlots
            .filter((r): r is { manager_id: string; couple_id: string } => r.couple_id !== null)
            .map((r) => ({ managerId: r.manager_id, coupleId: r.couple_id }))
        : [],
      danceScores: danceScoreInputs.map((d) => ({ coupleId: d.coupleId, totalScore: d.totalScore })),
      episodeOutcomes: episodeOutcomeInputs,
      predictions: (predictions ?? []).map((p) => ({
        managerId: p.manager_id,
        predictedEliminatedCoupleId: p.predicted_eliminated_couple_id,
        predictedEliminatedCoupleId2: p.predicted_eliminated_couple_id_2,
        predictedTopScorerCoupleId: p.predicted_top_scorer_couple_id,
      })),
      isFinale: episode.is_finale,
      isDoubleElimination: episode.is_double_elimination_week,
      categoryWeights: {
        judges: scoringSettings.judges_score_category_weight,
        eliminations: scoringSettings.eliminations_category_weight,
        bonus: scoringSettings.bonus_picks_category_weight,
      },
      grandFinalePointsByManager,
    });

    // Full replace, not partial upsert: a correction can drop a manager's
    // points for this episode to nothing (computeWeeklyScores then returns
    // no row for them at all), and an upsert would leave their prior-call
    // row stale forever. Deleting first — before the scores.length === 0
    // check below — makes that exact case (corrected results zeroing out a
    // league's scores) actually clear, instead of skipping the delete
    // whenever there's nothing left to upsert. Harmless no-op on a
    // first-time publish, since there's nothing to delete yet.
    await admin.from("weekly_manager_scores").delete().eq("league_id", league.id).eq("episode_id", episode.id);

    if (scores.length === 0) continue;

    const { error: upsertErr } = await admin.from("weekly_manager_scores").upsert(
      scores.map((s) => ({
        league_id: league.id,
        manager_id: s.managerId,
        episode_id: episode.id,
        roster_points: s.rosterPoints,
        prediction_points: s.predictionPoints,
        grand_finale_points: s.grandFinalePoints,
        total_points: s.totalPoints,
      })),
      { onConflict: "league_id,manager_id,episode_id" }
    );
    if (upsertErr) return { error: upsertErr.message };
  }

  return { error: null };
}
