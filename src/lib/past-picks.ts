import { findEliminatedCoupleIds, findTopScorerCoupleIds, type DanceScore } from "@/lib/scoring";

export type PickMatch = {
  pickId: string | null;
  correct: boolean;
};

export type PastPicksComparison = {
  eliminationPicks: PickMatch[];
  actualEliminatedIds: string[];
  topScorer: PickMatch;
  actualTopScorerIds: string[];
  predictionPoints: number;
};

// Latest visible completed week when the URL has no (or an unknown) week
// id; an unwatched completed week is still selectable so the lock card can
// prompt "Mark as watched" instead of leaking results. completedEpisodesDesc
// must already be week_number descending, same as resolveSpoilerCutoff.
export function selectPastPicksEpisode<E extends { id: string }>(
  completedEpisodesDesc: E[],
  allowedEpisodeIds: Set<string>,
  weekParam?: string | null
): E | null {
  if (completedEpisodesDesc.length === 0) return null;
  if (weekParam) {
    const requested = completedEpisodesDesc.find((e) => e.id === weekParam);
    if (requested) return requested;
  }
  return completedEpisodesDesc.find((e) => allowedEpisodeIds.has(e.id)) ?? completedEpisodesDesc[0] ?? null;
}

export function isPastPicksLocked(episodeId: string, allowedEpisodeIds: Set<string>): boolean {
  return !allowedEpisodeIds.has(episodeId);
}

export function matchEliminationPicks({
  predictedEliminatedCoupleId,
  predictedEliminatedCoupleId2,
  isDoubleElimination,
  eliminatedCoupleIds,
}: {
  predictedEliminatedCoupleId: string | null;
  predictedEliminatedCoupleId2: string | null;
  isDoubleElimination: boolean;
  eliminatedCoupleIds: Iterable<string>;
}): PickMatch[] {
  const actual = eliminatedCoupleIds instanceof Set ? eliminatedCoupleIds : new Set(eliminatedCoupleIds);
  const first: PickMatch = {
    pickId: predictedEliminatedCoupleId,
    correct: !!predictedEliminatedCoupleId && actual.has(predictedEliminatedCoupleId),
  };
  if (!isDoubleElimination) return [first];
  return [
    first,
    {
      pickId: predictedEliminatedCoupleId2,
      correct: !!predictedEliminatedCoupleId2 && actual.has(predictedEliminatedCoupleId2),
    },
  ];
}

export function matchTopScorerPick(
  predictedTopScorerCoupleId: string | null,
  topScorerCoupleIds: Iterable<string>
): PickMatch {
  const actual = topScorerCoupleIds instanceof Set ? topScorerCoupleIds : new Set(topScorerCoupleIds);
  return {
    pickId: predictedTopScorerCoupleId,
    correct: !!predictedTopScorerCoupleId && actual.has(predictedTopScorerCoupleId),
  };
}

export function buildPastPicksComparison({
  isDoubleElimination,
  predictedEliminatedCoupleId,
  predictedEliminatedCoupleId2,
  predictedTopScorerCoupleId,
  episodeOutcomes,
  danceScores,
  predictionPoints,
}: {
  isDoubleElimination: boolean;
  predictedEliminatedCoupleId: string | null;
  predictedEliminatedCoupleId2: string | null;
  predictedTopScorerCoupleId: string | null;
  episodeOutcomes: { coupleId: string; outcome: string }[];
  danceScores: DanceScore[];
  predictionPoints: number | null;
}): PastPicksComparison {
  const eliminatedCoupleIds = findEliminatedCoupleIds(episodeOutcomes);
  const topScorerCoupleIds = findTopScorerCoupleIds(danceScores);
  return {
    eliminationPicks: matchEliminationPicks({
      predictedEliminatedCoupleId,
      predictedEliminatedCoupleId2,
      isDoubleElimination,
      eliminatedCoupleIds,
    }),
    actualEliminatedIds: [...eliminatedCoupleIds],
    topScorer: matchTopScorerPick(predictedTopScorerCoupleId, topScorerCoupleIds),
    actualTopScorerIds: [...topScorerCoupleIds],
    predictionPoints: predictionPoints ?? 0,
  };
}
