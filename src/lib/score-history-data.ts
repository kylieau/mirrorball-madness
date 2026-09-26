import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { loadDraftScoreContext } from "@/lib/draft-scores-data";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { buildScoreHistory, weekResults, type HistoryWeekData, type ScoreHistoryLine } from "@/lib/score-history";
import type { GrandFinaleMethod, TierPayStyle } from "@/lib/scoring";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { isOwnMembership } from "@/lib/acting-manager";

// Matches the fallback the scoring engine (results.ts) applies, not the Picks UI default.
const GRAND_FINALE_SCORED_METHOD_FALLBACK: GrandFinaleMethod = "exact_position";

// Takes the viewer's own client on purpose: RLS then hides another manager's
// picks until they lock, so a peer's history can never show more than the
// league already can.
export async function loadScoreHistory(
  supabase: SupabaseClient<Database>,
  { userId, leagueId, managerId }: { userId: string; leagueId: string; managerId: string }
): Promise<{ lines: ScoreHistoryLine[]; error: null } | { lines: null; error: string }> {
  const { data: members, error: membersError } = await supabase
    .from("league_members")
    .select("user_id, co_manager_id")
    .eq("league_id", leagueId);
  if (membersError) return { lines: null, error: membersError.message };
  if (!members?.some((m) => isOwnMembership(m, userId))) return { lines: null, error: "Not a member of this league" };
  if (!members.some((m) => m.user_id === managerId)) return { lines: null, error: "Manager not found in this league" };

  const { data: seasonId } = await supabase.rpc("active_season_id");
  if (!seasonId) return { lines: [], error: null };

  const [{ data: weekRows }, { data: episodeRows }, { data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", seasonId),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, theme, status")
      .eq("season_id", seasonId),
    supabase.from("profiles").select("spoiler_free_mode").eq("id", userId).single(),
    supabase.from("scoring_settings").select("*").eq("league_id", leagueId).single(),
  ]);
  if (!settings) return { lines: null, error: "Scoring settings not found" };

  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const completedWeeks = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number);
  const cutoff = await resolveSpoilerCutoff(
    supabase,
    userId,
    seasonId,
    profile?.spoiler_free_mode ?? false,
    completedWeeks
  );
  const completedAllowedWeeks = completedWeeks.filter((week) => cutoff.allowedEpisodeIds.has(week.id));
  // A week being revealed has judges points but no outcomes yet: it is listed
  // (posted episodes only), and Curtain Call / Grand Finale lines stay out
  // until the final publish.
  const [{ revealing, visible: revealingVisible }, draftContext] = await Promise.all([
    loadRevealingWeek(supabase, groupedWeeks, cutoff),
    loadDraftScoreContext(supabase, userId),
  ]);
  const draftNight = draftContext.night;
  const revealingWeek =
    revealing && revealingVisible
      ? { ...revealing.week, episodes: revealing.week.episodes.filter((e) => revealing.episodeIds.includes(e.id)) }
      : null;
  const draftHistoryWeek =
    draftNight && !revealingWeek && !completedAllowedWeeks.some((week) => week.id === draftNight.weekId)
      ? groupedWeeks
          .filter((week) => week.id === draftNight.weekId)
          .map((week) => ({ ...week, episodes: week.episodes.filter((episode) => draftNight.episodeIds.includes(episode.id)) }))
      : [];
  const allowedWeeks = [...completedAllowedWeeks, ...(revealingWeek ? [revealingWeek] : []), ...draftHistoryWeek];
  if (allowedWeeks.length === 0) return { lines: [], error: null };

  const episodeIds = allowedWeeks.flatMap((week) => week.episodes.map((episode) => episode.id));
  const weekIds = completedAllowedWeeks.map((week) => week.id);

  const [
    { data: couples },
    { data: slots },
    { data: predictions },
    { data: grandFinalePredictions },
    { data: lateUnlock },
    { data: danceRows },
    { data: outcomeRows },
    { data: jeopardyRows },
  ] = await Promise.all([
    supabase
      .from("couples")
      .select("id, status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)")
      .eq("season_id", seasonId),
    supabase
      .from("roster_slots")
      .select("couple_id, start_week, end_week")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId),
    supabase
      .from("predictions")
      .select("week_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId)
      .in("week_id", weekIds),
    supabase
      .from("grand_finale_predictions")
      .select("couple_id, predicted_position")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId),
    supabase
      .from("grand_finale_late_unlocks")
      .select("late_factor, ineligible_couple_ids, submitted_at")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId)
      .maybeSingle(),
    supabase.from("dance_scores").select("episode_id, couple_id, total_score").in("episode_id", episodeIds),
    supabase.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
    supabase.from("episode_in_jeopardy_couples").select("episode_id, couple_id").in("episode_id", episodeIds),
  ]);

  const nameParts = buildCoupleDisplayNames(
    (couples ?? []).map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "?", pro_name: c.pro?.name ?? "?" }))
  );
  const coupleNames = new Map([...nameParts].map(([id, parts]) => [id, parts.celebrity]));

  const draftEpisodeIds = new Set(draftNight?.episodeIds ?? []);
  const historyDanceRows = [
    ...(danceRows ?? []).filter((row) => !draftEpisodeIds.has(row.episode_id)),
    ...(draftNight?.dances.map((dance) => ({
      episode_id: dance.episodeId,
      couple_id: dance.coupleId,
      total_score: dance.total,
    })) ?? []),
  ];
  const weeks: HistoryWeekData[] = allowedWeeks.map((week) => {
    const inWeek = new Set(week.episodes.map((episode) => episode.id));
    const results = weekResults(week.episodes.map((episode) => episode.id), historyDanceRows, outcomeRows ?? []);
    return {
      weekNumber: week.week_number,
      isDoubleElimination: draftNight?.weekId === week.id ? draftNight.isDoubleElimination : week.is_double_elimination_week,
      ...results,
      danceScores:
        draftNight && week.week_number === draftNight.weekNumber
          ? draftNight.dances.map((dance) => ({ coupleId: dance.coupleId, totalScore: dance.total }))
          : results.danceScores,
      inJeopardyCoupleIds: [
        ...new Set((jeopardyRows ?? []).filter((row) => inWeek.has(row.episode_id)).map((row) => row.couple_id)),
      ],
    };
  });

  const weekNumberById = new Map(completedAllowedWeeks.map((week) => [week.id, week.week_number]));

  const lines = buildScoreHistory({
    scoring: {
      judgesScoreMultiplier: settings.judges_score_multiplier,
      survivalPoints: settings.survival_points,
      eliminationPredictionPoints: settings.elimination_prediction_points,
      topScorerPredictionPoints: settings.top_scorer_prediction_points,
      firstPlacePoints: settings.first_place_points,
      secondPlacePoints: settings.second_place_points,
      thirdPlacePoints: settings.third_place_points,
      fourthPlacePoints: settings.fourth_place_points,
      fifthPlacePoints: settings.fifth_place_points,
      curtainCallNearMissEnabled: settings.curtain_call_near_miss_enabled !== false,
    },
    anchorWeek: settings.judges_score_starts_week,
    categoryWeights: {
      judges: settings.judges_score_category_weight,
      eliminations: settings.eliminations_category_weight,
      bonus: settings.bonus_picks_category_weight,
    },
    grandFinale: {
      method: (settings.bonus_picks_scoring_method as GrandFinaleMethod | null) ?? GRAND_FINALE_SCORED_METHOD_FALLBACK,
      distancePenalty: settings.bonus_picks_distance_penalty,
      tierSize: settings.bonus_picks_tier_size,
      tierPayStyle: settings.bonus_picks_tier_pay_style as TierPayStyle,
      pointsPerCorrect: settings.bonus_picks_points_per_correct,
    },
    couples: (couples ?? []).map((c) => ({ id: c.id, status: c.status, elimination_week: c.elimination_week })),
    coupleNames,
    weeks,
    rosterSlots: (slots ?? [])
      .filter((s): s is typeof s & { couple_id: string } => s.couple_id !== null)
      .map((s) => ({ managerId, coupleId: s.couple_id, startWeek: s.start_week, endWeek: s.end_week })),
    predictions: (predictions ?? []).flatMap((p) => {
      const weekNumber = weekNumberById.get(p.week_id);
      return weekNumber === undefined
        ? []
        : [
            {
              weekNumber,
              eliminatedCoupleId: p.predicted_eliminated_couple_id,
              eliminatedCoupleId2: p.predicted_eliminated_couple_id_2,
              topScorerCoupleId: p.predicted_top_scorer_couple_id,
            },
          ];
    }),
    weekSchedule: (weekRows ?? []).map((week) => ({
      weekNumber: week.week_number,
      eliminations: week.is_double_elimination_week ? 2 : week.is_elimination_week ? 1 : 0,
    })),
    grandFinalePredictions: (grandFinalePredictions ?? []).map((p) => ({
      coupleId: p.couple_id,
      predictedPosition: p.predicted_position,
    })),
    ...(lateUnlock?.submitted_at
      ? {
          grandFinaleLateFactor: Number(lateUnlock.late_factor),
          grandFinaleIneligibleCoupleIds: new Set(lateUnlock.ineligible_couple_ids ?? []),
        }
      : {}),
  });

  return { lines, error: null };
}
