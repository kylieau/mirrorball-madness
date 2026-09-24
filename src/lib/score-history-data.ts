import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { buildScoreHistory, type HistoryWeekData, type ScoreHistoryLine } from "@/lib/score-history";
import type { GrandFinaleMethod, Outcome, TierPayStyle } from "@/lib/scoring";
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

  const completedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? [])
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number);
  const cutoff = await resolveSpoilerCutoff(
    supabase,
    userId,
    seasonId,
    profile?.spoiler_free_mode ?? false,
    completedWeeks
  );
  const allowedWeeks = completedWeeks.filter((week) => cutoff.allowedEpisodeIds.has(week.id));
  if (allowedWeeks.length === 0) return { lines: [], error: null };

  const episodeIds = allowedWeeks.flatMap((week) => week.episodes.map((episode) => episode.id));
  const weekIds = allowedWeeks.map((week) => week.id);

  const [
    { data: couples },
    { data: slots },
    { data: predictions },
    { data: grandFinalePredictions },
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
    supabase.from("dance_scores").select("episode_id, couple_id, total_score").in("episode_id", episodeIds),
    supabase.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
    supabase.from("episode_in_jeopardy_couples").select("episode_id, couple_id").in("episode_id", episodeIds),
  ]);

  const nameParts = buildCoupleDisplayNames(
    (couples ?? []).map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "?", pro_name: c.pro?.name ?? "?" }))
  );
  const coupleNames = new Map([...nameParts].map(([id, parts]) => [id, parts.celebrity]));

  const weeks: HistoryWeekData[] = allowedWeeks.map((week) => {
    const inWeek = new Set(week.episodes.map((episode) => episode.id));
    const episodeOrder = new Map(week.episodes.map((episode, index) => [episode.id, index]));
    return {
      weekNumber: week.week_number,
      isDoubleElimination: week.is_double_elimination_week,
      danceScores: (danceRows ?? [])
        .filter((row) => inWeek.has(row.episode_id))
        .map((row) => ({ coupleId: row.couple_id, totalScore: Number(row.total_score) })),
      outcomes: (outcomeRows ?? [])
        .filter((row) => inWeek.has(row.episode_id))
        .sort((a, b) => episodeOrder.get(a.episode_id)! - episodeOrder.get(b.episode_id)!)
        .map((row) => ({
          coupleId: row.couple_id,
          outcome: row.outcome as Outcome,
          bonusPoints: Number(row.bonus_points),
        })),
      inJeopardyCoupleIds: [
        ...new Set((jeopardyRows ?? []).filter((row) => inWeek.has(row.episode_id)).map((row) => row.couple_id)),
      ],
    };
  });

  const weekNumberById = new Map(allowedWeeks.map((week) => [week.id, week.week_number]));

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
  });

  return { lines, error: null };
}
