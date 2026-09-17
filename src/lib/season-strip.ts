export type SeasonStripEpisode = {
  id: string;
  week_number: number;
  status: string;
  theme: string | null;
  airs_at: string;
};

export type SeasonStripKicker = "This past week" | "Up next";

// Show-night calendar, not the viewer's local date. A Tuesday 8pm ET
// episode should still read as Tuesday in time zones where that instant
// has already rolled into Wednesday. Safe to format during SSR — the
// zone is fixed, so it won't hydrate-mismatch.
const SHOW_TIME_ZONE = "America/New_York";

export function sortSeasonEpisodes(episodes: SeasonStripEpisode[]): SeasonStripEpisode[] {
  return [...episodes].sort((a, b) => a.week_number - b.week_number);
}

// Season cursor: the week that just happened. Mid-week that is "this past"
// episode (theme + date as schedule context); the right arrow is how you
// peek at Up next. Before premiere there is no completed week, so index 0.
export function defaultSeasonStripIndex(episodes: SeasonStripEpisode[]): number {
  const sorted = sortSeasonEpisodes(episodes);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === "completed") return i;
  }
  return 0;
}

export function seasonStripKicker(
  episode: SeasonStripEpisode,
  episodes: SeasonStripEpisode[]
): SeasonStripKicker | null {
  const sorted = sortSeasonEpisodes(episodes);
  const lastCompleted = [...sorted].reverse().find((e) => e.status === "completed") ?? null;
  const upNext = sorted.find((e) => e.status !== "completed") ?? null;
  if (lastCompleted && episode.id === lastCompleted.id) return "This past week";
  if (upNext && episode.id === upNext.id) return "Up next";
  return null;
}

export function formatAirDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: SHOW_TIME_ZONE,
  }).format(new Date(iso));
}
