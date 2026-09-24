type WeekLike = {
  id: string;
  week_number: number;
  episodes: { id: string; status: string; results_published_at?: string | null }[];
};

export type RevealingWeek<W extends WeekLike> = { week: W; episodeIds: string[] };

// A week is revealing while one of its unpublished episodes already has live
// dance scores: some couples are posted, the week's results are not.
export function findRevealingWeek<W extends WeekLike>(
  weeks: W[],
  episodeIdsWithScores: ReadonlySet<string>
): RevealingWeek<W> | null {
  for (const week of [...weeks].sort((a, b) => a.week_number - b.week_number)) {
    const episodeIds = week.episodes
      .filter((e) => e.status !== "completed" && !e.results_published_at && episodeIdsWithScores.has(e.id))
      .map((e) => e.id);
    if (episodeIds.length > 0) return { week, episodeIds };
  }
  return null;
}

// Weeks whose judge scores and points a viewer may see. Outcome-dependent
// surfaces keep using the completed-only allowed set; score and point
// surfaces add the revealing week for Spoiler-Free-off viewers, and for
// Spoiler-Free viewers who have marked that week watched.
export function scoredWeekIds(
  cutoff: { spoilerFreeMode: boolean; lastWatchedWeek: number | null; allowedEpisodeIds: ReadonlySet<string> },
  revealing: { id: string; week_number: number } | null
): Set<string> {
  const ids = new Set(cutoff.allowedEpisodeIds);
  if (!revealing) return ids;
  if (!cutoff.spoilerFreeMode || (cutoff.lastWatchedWeek ?? 0) >= revealing.week_number) ids.add(revealing.id);
  return ids;
}
