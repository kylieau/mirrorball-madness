import type { DraftState } from "./results-draft";
import type { ResultsPageData } from "./results-page-data";

export type DraftSummary = {
  hasDraft: boolean;
  entryCount: number;
  draftedCoupleIds: string[];
};

export function summarizeDrafts(drafts: Record<string, DraftState>): Record<string, DraftSummary> {
  return Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, {
    hasDraft: draft.hasDraft,
    entryCount: draft.entries.length,
    draftedCoupleIds: [...new Set(draft.dances.map((dance) => dance.coupleId))],
  }]));
}

// Filter before serialization: hidden rows and even their count can reveal an
// elimination. Episode metadata stays available for uniform locked-week cards.
export function visibleResultsData(
  data: Pick<ResultsPageData, "episodes" | "danceScores" | "judgeScores" | "episodeResults" | "inJeopardyByEpisode">,
  allowedWeekIds: Set<string>
) {
  const episodeIds = new Set(data.episodes.filter((episode) =>
    episode.week_id === null || allowedWeekIds.has(episode.week_id)
  ).map((episode) => episode.id));
  const danceScores = data.danceScores.filter((dance) => episodeIds.has(dance.episode_id));
  const danceIds = new Set(danceScores.map((dance) => dance.id));
  return {
    danceScores,
    judgeScores: data.judgeScores.filter((score) => danceIds.has(score.dance_score_id)),
    episodeResults: data.episodeResults.filter((result) => episodeIds.has(result.episode_id)),
    inJeopardyByEpisode: Object.fromEntries(Object.entries(data.inJeopardyByEpisode)
      .filter(([id]) => episodeIds.has(id))),
  };
}
