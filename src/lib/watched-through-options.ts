import { formatEpisodeCasual } from "./format-week";

// The Settings picker shows the newest fully published week and the three
// immediately before it. None stays available so the mark can be cleared.
export const WATCHED_THROUGH_WEEK_LIMIT = 4;

export function watchedThroughOptions(
  weekNumbers: number[],
  lastWatched: number,
  loaded: boolean,
): { value: string; label: string }[] {
  const newestFirst = [...new Set(weekNumbers)].sort((a, b) => b - a);
  const window = newestFirst.slice(0, WATCHED_THROUGH_WEEK_LIMIT);
  // A mark older than the window (or a week the list doesn't include) still
  // has to be a real option, or the closed Select can't show the current value.
  if (lastWatched > 0 && !window.includes(lastWatched)) {
    window.push(lastWatched);
    window.sort((a, b) => b - a);
  }
  return [
    ...window.map((week) => ({ value: String(week), label: formatEpisodeCasual(week) })),
    { value: "0", label: loaded ? "None" : "…" },
  ];
}
