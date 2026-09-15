// Derived, not stored — episodes.status ('upcoming'/'locked'/'completed') is
// untouched by any of this and still owns what Home/This Week/league pages
// read. This is purely the Site Admin UI's own view of where a given
// episode sits in the draft/publish lifecycle.
export type EpisodeResultsStatus = "not_started" | "draft" | "draft_correcting" | "published";

export function deriveResultsStatus(
  episode: { results_published_at: string | null },
  hasDraftRow: boolean
): EpisodeResultsStatus {
  if (hasDraftRow) return episode.results_published_at ? "draft_correcting" : "draft";
  return episode.results_published_at ? "published" : "not_started";
}

export const RESULTS_STATUS_BADGE_VARIANT: Record<EpisodeResultsStatus, "outline" | "secondary" | "default"> = {
  not_started: "outline",
  draft: "secondary",
  draft_correcting: "secondary",
  published: "default",
};

export const RESULTS_STATUS_BADGE_LABEL: Record<EpisodeResultsStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  draft_correcting: "Correcting",
  published: "Published",
};
