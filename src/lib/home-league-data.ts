import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupEpisodesByWeek, liveCompetitionWeek } from "@/lib/competition-week";
import { computeLeagueHomeSummary } from "@/lib/league-home-summary";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";

const RECENT_JOIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Shared by Home and See All so the season, spoiler-cutoff and per-league
// summary query shape can't drift between the two.
export async function loadHomeLeagueData(
  supabase: SupabaseClient<Database>,
  userId: string,
  spoilerFreeMode: boolean,
  leagueRefs: { id: string; name: string }[]
) {
  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", activeSeasonId ?? ""),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, duration_minutes, theme, status, results_published_at")
      .eq("season_id", activeSeasonId ?? ""),
  ]);
  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const liveWeek = liveCompetitionWeek(groupedWeeks);
  const upcomingEpisode = liveWeek ? { id: liveWeek.id, week_number: liveWeek.week_number } : null;
  const completedWeeks = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number)
    .map((week) => ({
      id: week.id,
      week_number: week.week_number,
      results_published_at:
        week.episodes
          .map((episode) => episode.results_published_at)
          .filter((value): value is string => !!value)
          .sort()
          .at(-1) ?? null,
      episodeIds: week.episodes.map((episode) => episode.id),
    }));

  const cutoff = await resolveSpoilerCutoff(supabase, userId, activeSeasonId ?? null, spoilerFreeMode, completedWeeks);

  const { revealing, scoredIds, visible: revealingVisible } = await loadRevealingWeek(supabase, groupedWeeks, cutoff);
  const revealingWeek = revealing && revealingVisible ? revealing.week : null;

  const trueLatestCompletedWeek = completedWeeks[0] ?? null;
  const latestCompletedWeekId = cutoff.effectiveLatestEpisode?.id ?? null;
  const latestCompletedResultsPublishedAt = cutoff.effectiveLatestEpisode?.results_published_at ?? null;
  const weeksBehind =
    trueLatestCompletedWeek && trueLatestCompletedWeek.id !== latestCompletedWeekId
      ? trueLatestCompletedWeek.week_number - (cutoff.effectiveLatestEpisode?.week_number ?? 0)
      : 0;

  const joinCutoffMs = Date.now() - RECENT_JOIN_WINDOW_MS;
  const summaries = await Promise.all(
    leagueRefs.map((league) =>
      computeLeagueHomeSummary(
        supabase,
        userId,
        league,
        upcomingEpisode,
        latestCompletedWeekId,
        latestCompletedResultsPublishedAt,
        joinCutoffMs,
        scoredIds,
        revealingWeek?.id ?? null
      )
    )
  );

  return {
    groupedWeeks,
    cutoff,
    revealing,
    revealingVisible,
    weeksBehind,
    summaries,
    liveWeekNumber: upcomingEpisode?.week_number ?? null,
    activeSeasonId: activeSeasonId ?? null,
    finaleWeekNumber: groupedWeeks.find((week) => week.is_finale)?.week_number ?? null,
  };
}
