export type ThisWeekCarouselEpisode = {
  id: string;
  week_number: number;
  theme: string | null;
  status: string;
  nightsLabel?: string | null;
};

export type ThisWeekSelectionMode = "results" | "peek";

export type ThisWeekSelection<E extends ThisWeekCarouselEpisode> = {
  episode: E | null;
  mode: ThisWeekSelectionMode | null;
};

// Visible completed weeks (spoiler-safe) plus not-yet-completed weeks for a
// theme peek. Unwatched completed weeks stay out so ?week= cannot land on a
// leaking results page — those stay on pending-reveal / mark-as-watched.
export function buildThisWeekCarouselWeeks<E extends ThisWeekCarouselEpisode>(
  seasonEpisodes: E[],
  visibleCompletedIds: Set<string>
): E[] {
  return [...seasonEpisodes]
    .filter((e) => visibleCompletedIds.has(e.id) || e.status !== "completed")
    .sort((a, b) => a.week_number - b.week_number);
}

export function selectThisWeekEpisode<E extends ThisWeekCarouselEpisode>(
  carouselWeeks: E[],
  weekParam?: string | null
): ThisWeekSelection<E> {
  if (carouselWeeks.length === 0) return { episode: null, mode: null };

  const requested = weekParam ? carouselWeeks.find((e) => e.id === weekParam) : undefined;
  const selected =
    requested ??
    [...carouselWeeks].reverse().find((e) => e.status === "completed") ??
    carouselWeeks[0];

  return {
    episode: selected,
    mode: selected.status === "completed" ? "results" : "peek",
  };
}

export function adjacentThisWeekWeeks<E extends { id: string }>(
  carouselWeeks: E[],
  currentId: string
): { prev: E | null; next: E | null } {
  const index = carouselWeeks.findIndex((e) => e.id === currentId);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: carouselWeeks[index - 1] ?? null,
    next: carouselWeeks[index + 1] ?? null,
  };
}

export function thisWeekHref(episodeId: string): string {
  return `/this-week?week=${episodeId}`;
}

export function pastPicksHref(leagueId: string, episodeId: string): string {
  return `/leagues/${leagueId}?tab=yourpicks&week=${episodeId}`;
}
