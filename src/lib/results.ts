import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  computeGrandFinalePoints,
  eliminationPositionRanges,
  computeWeeklyScores,
  couplesRemainingAtWeek,
  inJeopardyIdsToPersist,
  RESOLVING_OUTCOMES,
  type GrandFinaleMethod,
  type Outcome,
  type TierPayStyle,
} from "@/lib/scoring";
import { participantIdsToPersist, selectableCast } from "@/lib/episode-cast";
import { sortJudgesForDisplay } from "@/lib/couple-display";
import type { ScoringJudge } from "@/lib/scoring-judges";

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
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

// The "propose" tier: a commissioner of any league can draft results, while
// only is_super_admin can publish them. Not league-scoped like
// is_league_commissioner — results entry is cross-league — but it matches the
// same identity parity, so a co-manager of a commissioner's team qualifies too.
export async function userIsAnyLeagueCommissioner(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("league_members")
    .select("id")
    .eq("role", "commissioner")
    .or(`user_id.eq.${userId},co_manager_id.eq.${userId}`)
    .limit(1);
  return (data ?? []).length > 0;
}

// The three small managed lists: scoring judges, dance styles (with category),
// and round types. Shared by /admin/show-settings (which needs nothing else)
// and loadResultsPageData (which also joins episode → round type).
export async function loadResultsTaxonomy(
  supabase: SupabaseClient<Database>
): Promise<{
  judges: ScoringJudge[];
  danceStyles: { id: string; name: string; category: string | null }[];
  roundTypes: { id: string; name: string }[];
}> {
  const [{ data: judges }, { data: danceStyles }, { data: roundTypes }] = await Promise.all([
    supabase.from("people").select("id, name, archived_at").eq("role", "judge").order("name"),
    supabase.from("dance_styles").select("id, name, category").order("name"),
    supabase.from("round_types").select("id, name").order("name"),
  ]);

  return {
    judges: sortJudgesForDisplay(
      (judges ?? []).map((j) => ({ id: j.id, name: j.name, archivedAt: j.archived_at }))
    ),
    danceStyles: danceStyles ?? [],
    roundTypes: roundTypes ?? [],
  };
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

async function pruneDepartedCouplesFromFutureEpisodes(
  admin: SupabaseClient<Database>,
  seasonId: string,
  afterWeekNumber: number,
  current: { id: string; episodeNumber: number; weekId: string | null },
  coupleIds: string[]
): Promise<string | null> {
  if (coupleIds.length === 0) return null;

  const [{ data: weeks, error: weeksErr }, { data: unpublished, error }] = await Promise.all([
    admin.from("competition_weeks").select("id, week_number").eq("season_id", seasonId),
    admin
      .from("episodes")
      .select("id, week_id, episode_number")
      .eq("season_id", seasonId)
      .is("results_published_at", null),
  ]);
  if (weeksErr) return weeksErr.message;
  if (error) return error.message;

  const weekNumberById = new Map((weeks ?? []).map((week) => [week.id, week.week_number]));
  const futureIds = (unpublished ?? [])
    .filter((episode) => {
      if (episode.id === current.id) return false;
      if (episode.week_id && weekNumberById.get(episode.week_id)! > afterWeekNumber) return true;
      if (episode.week_id && episode.week_id === current.weekId && episode.episode_number > current.episodeNumber) {
        return true;
      }
      return episode.week_id == null && episode.episode_number > current.episodeNumber;
    })
    .map((episode) => episode.id);
  if (futureIds.length === 0) return null;

  const { error: participantsErr } = await admin
    .from("episode_participants")
    .delete()
    .in("episode_id", futureIds)
    .in("couple_id", coupleIds);
  if (participantsErr) return participantsErr.message;

  const { error: draftResultsErr } = await admin
    .from("draft_episode_results")
    .delete()
    .in("episode_id", futureIds)
    .in("couple_id", coupleIds);
  if (draftResultsErr) return draftResultsErr.message;

  const { error: draftDancesErr } = await admin
    .from("draft_dance_scores")
    .delete()
    .in("episode_id", futureIds)
    .in("couple_id", coupleIds);
  if (draftDancesErr) return draftDancesErr.message;

  const { error: draftMomentsErr } = await admin
    .from("draft_episode_custom_moments")
    .delete()
    .in("episode_id", futureIds)
    .in("couple_id", coupleIds);
  if (draftMomentsErr) return draftMomentsErr.message;

  return null;
}

export type ScheduleEpisodeInput = {
  episodeId: string | null;
  episodeNumber: number;
  // Null = exhibition / not on Results-Picks. Otherwise find-or-create that
  // competition week and attach this TV airing to it.
  competitionWeekNumber: number | null;
  weekTheme: string | null;
  airsAt: string;
  theme: string | null;
  isEliminationWeek: boolean;
  isFinale: boolean;
  isDoubleEliminationWeek: boolean;
  // Empty = unrestricted (every currently-active couple participates) — the
  // ordinary case. Only populated for a split-broadcast episode (e.g. a
  // two-night premiere where half the cast dances each night).
  participantCoupleIds: string[];
  roundTypeIds: string[];
  expectedDanceCount: number;
};

async function deleteWeekIfEmpty(
  admin: SupabaseClient<Database>,
  weekId: string | null
): Promise<string | null> {
  if (!weekId) return null;
  const { data: remaining, error } = await admin.from("episodes").select("id").eq("week_id", weekId).limit(1);
  if (error) return error.message;
  if ((remaining ?? []).length > 0) return null;
  const { error: deleteErr } = await admin.from("competition_weeks").delete().eq("id", weekId);
  return deleteErr?.message ?? null;
}

// Sets everything known ahead of air: episode number, date, theme, week
// assignment, who's performing, round types, and dances per couple. Status
// stays owned by publish.
export async function applyEpisodeSchedule(
  admin: SupabaseClient<Database>,
  input: ScheduleEpisodeInput
): Promise<{ error: string | null }> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return { error: seasonErr };

  if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1) {
    return { error: "Episode number must be a positive integer." };
  }
  if (input.competitionWeekNumber != null && (input.competitionWeekNumber < 1 || !Number.isInteger(input.competitionWeekNumber))) {
    return { error: "Competition week must be a positive integer, or blank for exhibition." };
  }
  if (!Number.isInteger(input.expectedDanceCount) || input.expectedDanceCount < 1) {
    return { error: "Dances per couple must be a positive integer." };
  }

  let weekId: string | null = null;
  if (input.competitionWeekNumber != null) {
    const { data: existingWeek } = await admin
      .from("competition_weeks")
      .select("id, theme")
      .eq("season_id", seasonId)
      .eq("week_number", input.competitionWeekNumber)
      .maybeSingle();

    const weekTheme = input.weekTheme?.trim() || existingWeek?.theme || input.theme;
    const { data: week, error: weekErr } = await admin
      .from("competition_weeks")
      .upsert(
        {
          season_id: seasonId,
          week_number: input.competitionWeekNumber,
          theme: weekTheme,
          is_elimination_week: input.isEliminationWeek,
          is_finale: input.isFinale,
          is_double_elimination_week: input.isDoubleEliminationWeek,
        },
        { onConflict: "season_id,week_number" }
      )
      .select("id")
      .single();
    if (weekErr) return { error: weekErr.message };
    weekId = week.id;
  }

  const previousWeekId = input.episodeId
    ? ((await admin.from("episodes").select("week_id").eq("id", input.episodeId).maybeSingle()).data?.week_id ?? null)
    : null;

  const episodeFields = {
    season_id: seasonId,
    episode_number: input.episodeNumber,
    week_id: weekId,
    airs_at: input.airsAt,
    theme: input.theme,
    expected_dance_count: input.expectedDanceCount,
  };

  const { data: episode, error } = input.episodeId
    ? await admin.from("episodes").update(episodeFields).eq("id", input.episodeId).select().single()
    : await admin.from("episodes").insert(episodeFields).select().single();
  if (error) return { error: error.message };

  if (previousWeekId && previousWeekId !== weekId) {
    const emptyErr = await deleteWeekIfEmpty(admin, previousWeekId);
    if (emptyErr) return { error: emptyErr };
  }

  const { data: seasonCouples, error: couplesErr } = await admin
    .from("couples")
    .select("id, status, elimination_week")
    .eq("season_id", seasonId);
  if (couplesErr) return { error: couplesErr.message };

  const castWeek = input.competitionWeekNumber ?? input.episodeNumber;
  const selectableIds = selectableCast(seasonCouples ?? [], castWeek, {
    published: episode.results_published_at != null,
  }).map((c) => c.id);
  const toWrite = participantIdsToPersist(input.participantCoupleIds, selectableIds);

  await admin.from("episode_participants").delete().eq("episode_id", episode.id);
  if (toWrite.length > 0) {
    const { error: participantsErr } = await admin.from("episode_participants").insert(
      toWrite.map((coupleId) => ({ episode_id: episode.id, couple_id: coupleId }))
    );
    if (participantsErr) return { error: participantsErr.message };
  }

  const roundTypeIds = [...new Set(input.roundTypeIds)];
  await admin.from("episode_round_types").delete().eq("episode_id", episode.id);
  if (roundTypeIds.length > 0) {
    const { error: roundTypesErr } = await admin.from("episode_round_types").insert(
      roundTypeIds.map((roundTypeId) => ({ episode_id: episode.id, round_type_id: roundTypeId }))
    );
    if (roundTypesErr) return { error: roundTypesErr.message };
  }

  return { error: null };
}

export type EpisodeResultsInput = {
  episodeId: string;
  entries: EntrySubmission[];
  inJeopardyCoupleIds: string[];
};

export async function replaceInJeopardyCouples(
  admin: SupabaseClient<Database>,
  table: "episode_in_jeopardy_couples" | "draft_episode_in_jeopardy_couples",
  episodeId: string,
  coupleIds: string[]
): Promise<string | null> {
  const { error: deleteError } = await admin.from(table).delete().eq("episode_id", episodeId);
  if (deleteError) return deleteError.message;
  if (coupleIds.length === 0) return null;
  const { error } = await admin.from(table).insert(
    coupleIds.map((coupleId) => ({ episode_id: episodeId, couple_id: coupleId }))
  );
  return error?.message ?? null;
}

async function recomputeWeekScores(
  admin: SupabaseClient<Database>,
  seasonId: string,
  week: {
    id: string;
    week_number: number;
    is_double_elimination_week: boolean;
  },
  episodeIds: string[],
  thisEpisodeOutcomeRows: { couple_id: string; outcome: string; bonus_points: number }[],
  thisEpisodeId: string
): Promise<string | null> {
  const [{ data: allDances, error: dancesErr }, { data: allOutcomes, error: outcomesErr }] = await Promise.all([
    admin.from("dance_scores").select("couple_id, total_score").in("episode_id", episodeIds),
    admin.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
  ]);
  if (dancesErr) return dancesErr.message;
  if (outcomesErr) return outcomesErr.message;

  const danceScoreInputs = (allDances ?? []).map((row) => ({
    coupleId: row.couple_id,
    totalScore: Number(row.total_score),
  }));
  const otherOutcomes = (allOutcomes ?? []).filter((row) => row.episode_id !== thisEpisodeId);
  const rawOutcomeRows = [
    ...otherOutcomes.map((row) => ({
      coupleId: row.couple_id,
      outcome: row.outcome as Outcome,
      bonusPoints: Number(row.bonus_points),
    })),
    ...thisEpisodeOutcomeRows.map((row) => ({
      coupleId: row.couple_id,
      outcome: row.outcome as Outcome,
      bonusPoints: row.bonus_points,
    })),
  ];

  const { data: leagues, error: leaguesErr } = await admin.from("leagues").select("id");
  if (leaguesErr) return leaguesErr.message;

  const newlyResolvedCoupleIds = thisEpisodeOutcomeRows
    .filter((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome))
    .map((r) => r.couple_id);

  // Fetched unconditionally (not just on a resolving week) because
  // couplesRemaining/totalCouples now feed Curtain Call's couples-remaining
  // scaling every week, not just weeks where a couple's fate newly resolved.
  const { data: seasonCouples, error: seasonCouplesErr } = await admin
    .from("couples")
    .select("id, status, elimination_week")
    .eq("season_id", seasonId);
  if (seasonCouplesErr) return seasonCouplesErr.message;

  const totalCouples = (seasonCouples ?? []).length;
  const positionRanges = eliminationPositionRanges(seasonCouples ?? []);
  const actualPositionByCouple = new Map([...positionRanges].map(([id, range]) => [id, range.start]));

  // finalPlacement: 1 = winner .. 5 = fifth place, reusing the same numeric
  // position Grand Finale's full-order prediction already resolves against
  // — see computeWeeklyScores in src/lib/scoring.ts. No new couples.status
  // value, no new admin UI: 4th/5th place is derived, not entered.
  const finalPlacementByCouple = new Map<string, number>();
  for (const [coupleId, actualPosition] of actualPositionByCouple) {
    const placement = totalCouples - actualPosition + 1;
    if (placement <= 5) finalPlacementByCouple.set(coupleId, placement);
  }

  // How many couples were still in the running going into this week, before
  // any of this week's own eliminations — matches what managers saw when
  // they locked their Curtain Call pick. Using "< week.week_number" (not a
  // live couples.status check) makes this correct regardless of whether
  // this call is entering one of several episodes sharing this week, or
  // correcting a week whose couples.status has already been mutated above.
  const couplesRemaining = couplesRemainingAtWeek(
    (seasonCouples ?? []).map((c) => ({ eliminationWeek: c.elimination_week })),
    week.week_number
  );

  // Only the row that settles a couple's fate carries its placement. Every
  // other row of the same couple (a "safe" week) would otherwise re-award the
  // podium bonus when an earlier week is recomputed after the finale.
  const episodeOutcomeInputs = rawOutcomeRows.map((row) => ({
    ...row,
    finalPlacement: RESOLVING_OUTCOMES.has(row.outcome) ? (finalPlacementByCouple.get(row.coupleId) ?? null) : null,
  }));

  let inJeopardyCoupleIds: string[] = [];
  if (episodeIds.length > 0) {
    const { data: jeopardyRows, error: jeopardyErr } = await admin
      .from("episode_in_jeopardy_couples")
      .select("couple_id")
      .in("episode_id", episodeIds);
    if (jeopardyErr) return jeopardyErr.message;
    inJeopardyCoupleIds = [...new Set((jeopardyRows ?? []).map((row) => row.couple_id))];
  }

  for (const league of leagues ?? []) {
    const [{ data: scoringSettings }, { data: rosterSlots }, { data: predictions }] = await Promise.all([
      admin.from("scoring_settings").select("*").eq("league_id", league.id).single(),
      admin
        .from("roster_slots")
        .select("manager_id, couple_id")
        .eq("league_id", league.id)
        .lte("start_week", week.week_number)
        .or(`end_week.is.null,end_week.gte.${week.week_number}`),
      admin
        .from("predictions")
        .select("manager_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
        .eq("league_id", league.id)
        .eq("week_id", week.id),
    ]);

    if (!scoringSettings || !rosterSlots) continue;

    // The league's Anchor Week is when scoring begins for every module: a
    // week that aired before it pays nothing, even where picks exist for it.
    const scoringStarted = week.week_number >= scoringSettings.judges_score_starts_week;

    let grandFinalePointsByManager: Record<string, number> = {};
    if (scoringStarted && newlyResolvedCoupleIds.length > 0) {
      const { data: grandFinalePredictions, error: gfpErr } = await admin
        .from("grand_finale_predictions")
        .select("manager_id, couple_id, predicted_position")
        .eq("league_id", league.id)
        .in("couple_id", newlyResolvedCoupleIds);
      if (gfpErr) return gfpErr.message;

      grandFinalePointsByManager = computeGrandFinalePoints({
        predictions: (grandFinalePredictions ?? []).map((p) => ({
          managerId: p.manager_id,
          coupleId: p.couple_id,
          predictedPosition: p.predicted_position,
        })),
        resolvedCouples: newlyResolvedCoupleIds
          .filter((id) => actualPositionByCouple.has(id))
          .map((id) => ({
            coupleId: id,
            actualPosition: positionRanges.get(id)!.start,
            actualPositionEnd: positionRanges.get(id)!.end,
          })),
        totalCouples,
        method: (scoringSettings.bonus_picks_scoring_method as GrandFinaleMethod) ?? "exact_position",
        distancePenalty: scoringSettings.bonus_picks_distance_penalty,
        tierSize: scoringSettings.bonus_picks_tier_size,
        tierPayStyle: scoringSettings.bonus_picks_tier_pay_style as TierPayStyle,
        pointsPerCorrect: scoringSettings.bonus_picks_points_per_correct,
      });
    }

    const scores = computeWeeklyScores({
      scoringSettings: {
        judgesScoreMultiplier: scoringSettings.judges_score_multiplier,
        survivalPoints: scoringSettings.survival_points,
        eliminationPredictionPoints: scoringSettings.elimination_prediction_points,
        topScorerPredictionPoints: scoringSettings.top_scorer_prediction_points,
        firstPlacePoints: scoringSettings.first_place_points,
        secondPlacePoints: scoringSettings.second_place_points,
        thirdPlacePoints: scoringSettings.third_place_points,
        fourthPlacePoints: scoringSettings.fourth_place_points,
        fifthPlacePoints: scoringSettings.fifth_place_points,
        curtainCallNearMissEnabled: scoringSettings.curtain_call_near_miss_enabled !== false,
      },
      rosterSlots: scoringStarted
        ? rosterSlots
            .filter((r): r is { manager_id: string; couple_id: string } => r.couple_id !== null)
            .map((r) => ({ managerId: r.manager_id, coupleId: r.couple_id }))
        : [],
      danceScores: danceScoreInputs,
      episodeOutcomes: episodeOutcomeInputs,
      predictions: scoringStarted
        ? (predictions ?? []).map((p) => ({
            managerId: p.manager_id,
            predictedEliminatedCoupleId: p.predicted_eliminated_couple_id,
            predictedEliminatedCoupleId2: p.predicted_eliminated_couple_id_2,
            predictedTopScorerCoupleId: p.predicted_top_scorer_couple_id,
          }))
        : [],
      isDoubleElimination: week.is_double_elimination_week,
      couplesRemaining,
      totalCouples,
      categoryWeights: {
        judges: scoringSettings.judges_score_category_weight,
        eliminations: scoringSettings.eliminations_category_weight,
        bonus: scoringSettings.bonus_picks_category_weight,
      },
      grandFinalePointsByManager,
      inJeopardyCoupleIds,
    });

    await admin.from("weekly_manager_scores").delete().eq("league_id", league.id).eq("week_id", week.id);

    if (scores.length === 0) continue;

    const { error: upsertErr } = await admin.from("weekly_manager_scores").upsert(
      scores.map((s) => ({
        league_id: league.id,
        manager_id: s.managerId,
        week_id: week.id,
        roster_points: s.rosterPoints,
        prediction_points: s.predictionPoints,
        grand_finale_points: s.grandFinalePoints,
        total_points: s.totalPoints,
      })),
      { onConflict: "league_id,manager_id,week_id" }
    );
    if (upsertErr) return upsertErr.message;
  }

  return null;
}

// Takes an already-authorized admin (service-role) client — the caller is
// responsible for verifying publish access (profiles.is_super_admin) first.
// Kept separate from the 'use server' action so it can be exercised directly
// in tests without a Next.js request context.
export async function applyEpisodeResults(
  admin: SupabaseClient<Database>,
  input: EpisodeResultsInput
): Promise<{ error: string | null }> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return { error: seasonErr };

  const { data: episode, error: episodeErr } = await admin
    .from("episodes")
    .update({
      status: input.entries.length > 0 ? "completed" : "upcoming",
      results_published_at: input.entries.length > 0 ? new Date().toISOString() : null,
    })
    .eq("id", input.episodeId)
    .select()
    .single();

  if (episodeErr) return { error: episodeErr.message };

  const week = episode.week_id
    ? (
        await admin
          .from("competition_weeks")
          .select("id, week_number, is_double_elimination_week")
          .eq("id", episode.week_id)
          .single()
      ).data
    : null;

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
    let stillResolved = new Set<string>();
    if (week) {
      const { data: siblingEpisodes } = await admin
        .from("episodes")
        .select("id")
        .eq("week_id", week.id)
        .neq("id", episode.id);
      const siblingIds = (siblingEpisodes ?? []).map((row) => row.id);
      if (siblingIds.length > 0) {
        const { data: siblingOutcomes } = await admin
          .from("episode_results")
          .select("couple_id, outcome")
          .in("episode_id", siblingIds);
        stillResolved = new Set(
          (siblingOutcomes ?? [])
            .filter((row) => RESOLVING_OUTCOMES.has(row.outcome as Outcome))
            .map((row) => row.couple_id)
        );
      }
    }
    const toRevert = revertedIds.filter((id) => !stillResolved.has(id));
    if (toRevert.length > 0) {
      await admin.from("couples").update({ status: "active", elimination_week: null }).in("id", toRevert);
    }
  }

  await admin.from("dance_scores").delete().eq("episode_id", episode.id);
  await admin.from("episode_results").delete().eq("episode_id", episode.id);

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
    }
  }

  const outcomeRows = input.entries.map((e) => ({
    episode_id: episode.id,
    couple_id: e.coupleId,
    outcome: e.outcome,
    saved_by_judges: e.savedByJudges,
    had_immunity: e.hadImmunity,
    bonus_points: e.bonusPoints,
    bonus_note: e.bonusNote,
  }));
  if (outcomeRows.length > 0) {
    const { error } = await admin.from("episode_results").insert(outcomeRows);
    if (error) return { error: error.message };
  }

  const jeopardyErr = await replaceInJeopardyCouples(
    admin,
    "episode_in_jeopardy_couples",
    episode.id,
    inJeopardyIdsToPersist(input.inJeopardyCoupleIds, input.entries)
  );
  if (jeopardyErr) return { error: jeopardyErr };

  if (week) {
    for (const e of input.entries) {
      if (e.outcome === "eliminated" || e.outcome === "withdrawn") {
        await admin
          .from("couples")
          .update({ status: e.outcome, elimination_week: week.week_number })
          .eq("id", e.coupleId);
      } else if (e.outcome === "winner" || e.outcome === "runner_up" || e.outcome === "third_place") {
        await admin.from("couples").update({ status: e.outcome, elimination_week: null }).eq("id", e.coupleId);
      }
    }

    const departedIds = input.entries
      .filter((e) => RESOLVING_OUTCOMES.has(e.outcome))
      .map((e) => e.coupleId);
    const pruneErr = await pruneDepartedCouplesFromFutureEpisodes(
      admin,
      seasonId,
      week.week_number,
      { id: episode.id, episodeNumber: episode.episode_number, weekId: week.id },
      departedIds
    );
    if (pruneErr) return { error: pruneErr };

    const { data: weekEpisodes, error: weekEpisodesErr } = await admin
      .from("episodes")
      .select("id")
      .eq("week_id", week.id);
    if (weekEpisodesErr) return { error: weekEpisodesErr.message };

    const scoreErr = await recomputeWeekScores(
      admin,
      seasonId,
      week,
      (weekEpisodes ?? []).map((row) => row.id),
      outcomeRows.map((r) => ({ couple_id: r.couple_id, outcome: r.outcome, bonus_points: r.bonus_points })),
      episode.id
    );
    if (scoreErr) return { error: scoreErr };
  }

  return { error: null };
}
