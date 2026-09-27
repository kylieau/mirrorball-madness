import { formatEpisodeCasual } from "./format-week";

// None is week 0. It only shows when it is still one of the four most recent
// options (the latest published week and up to three before it).
export const WATCHED_THROUGH_WEEK_LIMIT = 4;

export function watchedThroughOptions(
  weekNumbers: number[],
  lastWatched: number,
  loaded: boolean,
): { value: string; label: string }[] {
  const published = [...new Set(weekNumbers.filter((week) => week > 0))].sort((a, b) => b - a);
  const window = [...published, 0].slice(0, WATCHED_THROUGH_WEEK_LIMIT);
  // A real week outside that window still has to be selectable, or the closed
  // Select can't show the current mark. Week 0 does not get that exception.
  if (lastWatched > 0 && !window.includes(lastWatched)) {
    window.push(lastWatched);
    window.sort((a, b) => b - a);
  }
  return window.map((week) => ({
    value: String(week),
    label: week === 0 ? (loaded ? "None" : "…") : formatEpisodeCasual(week),
  }));
}
