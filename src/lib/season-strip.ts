import { formatEpisodeCasualWithTheme } from "./format-week";

export type SeasonStripEpisode = {
  id: string;
  week_number: number;
  status: string;
  theme: string | null;
  airs_at: string;
};

export type SeasonStripSlots = {
  justAired: SeasonStripEpisode | null;
  upNext: SeasonStripEpisode | null;
};

// Show-night calendar, not the viewer's local date. A Tuesday 8pm ET
// episode should still read as Tuesday in time zones where that instant
// has already rolled into Wednesday. Safe to format during SSR — the
// zone is fixed, so it won't hydrate-mismatch.
const SHOW_TIME_ZONE = "America/New_York";

export function pickSeasonStripSlots(episodes: SeasonStripEpisode[]): SeasonStripSlots {
  const justAired = [...episodes]
    .filter((e) => e.status === "completed")
    .sort((a, b) => b.week_number - a.week_number)[0] ?? null;
  const upNext = [...episodes]
    .filter((e) => e.status !== "completed")
    .sort((a, b) => a.week_number - b.week_number)[0] ?? null;
  return { justAired, upNext };
}

export function formatAirDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: SHOW_TIME_ZONE,
  }).format(new Date(iso));
}

export function seasonStripAriaLabel(slots: SeasonStripSlots): string {
  const parts: string[] = [];
  if (slots.justAired) {
    parts.push(
      `Just aired ${formatEpisodeCasualWithTheme(slots.justAired.week_number, slots.justAired.theme)}`
    );
  }
  if (slots.upNext) {
    parts.push(`Up next ${formatEpisodeCasualWithTheme(slots.upNext.week_number, slots.upNext.theme)}`);
  }
  parts.push("Open This Week");
  return parts.join(". ");
}
