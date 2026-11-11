import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { loadDraftScoreContext } from "@/lib/draft-scores-data";
import { excludeReleasedCoupleRows, unpostedDraftDances } from "@/lib/draft-scores";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { danceCardRule, danceCardWeekEpisodeIds } from "@/lib/dance-card-v2";
import {
  buildScoreHistory,
  weekResults,
  withLifelineLines,
  withTradeLines,
  type HistoryWeekData,
  type ScoreHistoryLine,
} from "@/lib/score-history";
import { scoringSettingsFromRow, type GrandFinaleMethod, type TierPayStyle } from "@/lib/scoring";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { isOwnMembership } from "@/lib/acting-manager";
import { formatManagerName } from "@/lib/manager-display";
import { danceMaxScore, danceScoreColumns } from "@/lib/episode-teams";
import { loadAllCouples, loadTeamsMode, loadViewerSeason } from "@/lib/viewer-season-data";

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
    .select(
      "user_id, co_manager_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
    )
    .eq("league_id", leagueId);
  if (membersError) return { lines: null, error: membersError.message };
  if (!members?.some((m) => isOwnMembership(m, userId))) return { lines: null, error: "Not a member of this league" };
  if (!members.some((m) => m.user_id === managerId)) return { lines: null, error: "Manager not found in this league" };

  const draftContextPending = loadDraftScoreContext(supabase, userId);
  const [season, { data: profile, error: profileError }, { data: settings }, teamsMode, { data: league }] = await Promise.all([
    loadViewerSeason(supabase, userId),
    supabase.from("profiles").select("spoiler_free_mode").eq("id", userId).single(),
    supabase.from("scoring_settings").select("*").eq("league_id", leagueId).single(),
    loadTeamsMode(supabase),
    supabase.from("leagues").select("roster_size").eq("id", leagueId).single(),
  ]);
  if (profileError || !profile) return { lines: null, error: "Could not load spoiler preferences. Please try again." };
  const { seasonId, weekRows, episodeRows } = season;
  if (!seasonId) return { lines: [], error: null };
  if (!settings || !league) return { lines: null, error: "Scoring settings not found" };

  const groupedWeeks = groupEpisodesByWeek(weekRows, episodeRows);
  const completedWeeks = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number);
  const cutoffPending = resolveSpoilerCutoff(
    supabase,
    userId,
    seasonId,
    profile?.spoiler_free_mode ?? false,
    completedWeeks
  );
  // A week being revealed has judges points but no outcomes yet: it is listed
  // (posted episodes only), and Curtain Call / Grand Finale lines stay out
  // until the final publish.
  const [cutoff, { revealing, visible: revealingVisible }, draftContext] = await Promise.all([
    cutoffPending,
    loadRevealingWeek(supabase, groupedWeeks, cutoffPending),
    draftContextPending,
  ]);
  const completedAllowedWeeks = completedWeeks.filter((week) => cutoff.allowedEpisodeIds.has(week.id));
  const draftNight = draftContext.night;
  // A two-night week can be posting on one night with a released draft on the
  // other; the week lists both nights.
  const revealingWeek =
    revealing && revealingVisible
      ? {
          ...revealing.week,
          episodes: revealing.week.episodes.filter(
            (e) => revealing.episodeIds.includes(e.id) || (draftNight?.weekId === revealing.week.id && draftNight.episodeIds.includes(e.id))
          ),
        }
      : null;
  const draftHistoryWeek =
    draftNight && !revealingWeek && !completedAllowedWeeks.some((week) => week.id === draftNight.weekId)
      ? groupedWeeks
          .filter((week) => week.id === draftNight.weekId)
          .map((week) => ({ ...week, episodes: week.episodes.filter((episode) => draftNight.episodeIds.includes(episode.id)) }))
      : [];
  const allowedWeeks = [...completedAllowedWeeks, ...(revealingWeek ? [revealingWeek] : []), ...draftHistoryWeek];
  if (allowedWeeks.length === 0) return { lines: [], error: null };

  // A v2/v3 credit covers the whole week, so a week still posting also reads its
  // published sibling nights as Dance Card input; the lines shown don't change.
  const rule = danceCardRule(settings, league.roster_size);
  const danceCardEpisodeIds = (week: (typeof allowedWeeks)[number]) => {
    const shown = week.episodes.map((episode) => episode.id);
    return rule.version !== "v1"
      ? danceCardWeekEpisodeIds(shown, groupedWeeks.find((w) => w.id === week.id)?.episodes ?? [])
      : shown;
  };
  const episodeIds = allowedWeeks.flatMap(danceCardEpisodeIds);
  const weekIds = completedAllowedWeeks.map((week) => week.id);

  const [
    allCouples,
    { data: slots },
    { data: predictions },
    { data: grandFinalePredictions },
    { data: lateUnlock },
    { data: danceRows },
    { data: outcomeRows },
    { data: jeopardyRows },
    { data: lifelinePayouts },
    { data: adjustments },
  ] = await Promise.all([
    loadAllCouples(supabase),
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
    supabase
      .from("dance_scores")
      .select(danceScoreColumns(teamsMode, "episode_id, couple_id, total_score, scaled_score", { teamId: true }))
      .in("episode_id", episodeIds),
    supabase.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
    supabase.from("episode_in_jeopardy_couples").select("episode_id, couple_id").in("episode_id", episodeIds),
    supabase
      .from("lifeline_payouts")
      .select("week_id, slot_number, couple_id, weighted_points")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId)
      .in("week_id", weekIds),
    supabase
      .from("league_point_adjustments")
      .select("id, kind, week_id, weighted_points, detail")
      .eq("league_id", leagueId)
      .eq("manager_id", managerId)
      .in("kind", ["lifeline_equalizer", "trade_transfer"])
      .in("week_id", weekIds),
  ]);
  const couples = allCouples.filter((couple) => couple.season_id === seasonId);
  const liveDanceRows = (
    (danceRows ?? []) as unknown as { episode_id: string; couple_id: string; total_score: number; scaled_score: number; max_score?: number | null; team_id?: string | null }[]
  ).map((row) => ({ ...row, max_score: danceMaxScore(row) }));

  const nameParts = buildCoupleDisplayNames(
    couples.map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "?", pro_name: c.pro?.name ?? "?" }))
  );
  const coupleNames = new Map([...nameParts].map(([id, parts]) => [id, parts.celebrity]));

  // Excludes only released couples' live rows (not the whole episode), so a
  // couple independently live-revealed via per-couple Publish keeps showing
  // even in an episode that also has other couples still mid-draft.
  const historyDanceRows = [
    ...excludeReleasedCoupleRows(liveDanceRows, draftNight?.releasedCoupleIdsByEpisode ?? {}),
    ...(unpostedDraftDances(draftNight?.dances ?? [], liveDanceRows.map((row) => row.team_id)).map((dance) => ({
      episode_id: dance.episodeId,
      couple_id: dance.coupleId,
      total_score: dance.total,
      scaled_score: dance.scaled,
      max_score: dance.maxScore,
      team_id: dance.teamId,
    }))),
  ];
  const weeks: HistoryWeekData[] = allowedWeeks.map((week) => {
    const inWeek = new Set(week.episodes.map((episode) => episode.id));
    const results = weekResults(week.episodes.map((episode) => episode.id), historyDanceRows, outcomeRows ?? []);
    return {
      weekNumber: week.week_number,
      isDoubleElimination: draftNight?.weekId === week.id ? draftNight.isDoubleElimination : week.is_double_elimination_week,
      ...results,
      inJeopardyCoupleIds: [
        ...new Set((jeopardyRows ?? []).filter((row) => inWeek.has(row.episode_id)).map((row) => row.couple_id)),
      ],
    };
  });

  const weekNumberById = new Map(completedAllowedWeeks.map((week) => [week.id, week.week_number]));

  const lines = buildScoreHistory({
    scoring: scoringSettingsFromRow(settings),
    danceCardRule: rule,
    danceCardWeeks:
      rule.version !== "v1"
        ? allowedWeeks.map((week) => ({
            weekNumber: week.week_number,
            ...weekResults(danceCardEpisodeIds(week), historyDanceRows, outcomeRows ?? []),
          }))
        : undefined,
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
    couples: couples.map((c) => ({ id: c.id, status: c.status, elimination_week: c.elimination_week })),
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
    weekSchedule: weekRows.map((week) => ({
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

  const lifeline = {
    weight: settings.judges_score_category_weight,
    payouts: (lifelinePayouts ?? []).flatMap((row) => {
      const weekNumber = weekNumberById.get(row.week_id);
      return weekNumber === undefined
        ? []
        : [{ weekNumber, slotNumber: row.slot_number, coupleId: row.couple_id, weightedPoints: Number(row.weighted_points) }];
    }),
    equalizers: (adjustments ?? []).flatMap((row) => {
      const weekNumber = weekNumberById.get(row.week_id);
      const weeks = (row.detail as { weeks?: number[] } | null)?.weeks ?? [];
      return row.kind !== "lifeline_equalizer" || weekNumber === undefined
        ? []
        : [{ weekNumber, weightedPoints: Number(row.weighted_points), weeks }];
    }),
  };
  const transfers = (adjustments ?? []).flatMap((row) => {
    const weekNumber = weekNumberById.get(row.week_id);
    const otherManagerId = (row.detail as { with?: string } | null)?.with ?? null;
    return row.kind !== "trade_transfer" || weekNumber === undefined
      ? []
      : [{ id: row.id, weekNumber, points: Number(row.weighted_points), otherManagerId }];
  });
  const managerNames = new Map(
    members.map((m) => [
      m.user_id,
      formatManagerName({ displayName: m.profiles?.display_name ?? "Unknown", coManagerDisplayName: m.co_manager?.display_name }),
    ])
  );
  return {
    lines: withTradeLines(withLifelineLines(lines, lifeline, coupleNames), transfers, managerNames),
    error: null,
  };
}
