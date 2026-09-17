import { findEliminatedCoupleIds, findTopScorerCoupleIds, type DanceScore } from "./scoring";

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

export type PastPicksDisplayRow =
  | { kind: "nailed"; coupleIds: string[] }
  | { kind: "miss"; pickIds: string[]; actualIds: string[] };

// Layout A for hits: one "Nailed it" line so the couple isn't printed twice.
// Layout 2 for misses: one strike→actual line per slot (no stacked Actual row).
// Double-elim slots collapse independently, in slot order.
export function collapsePickRows(picks: PickMatch[], actualIds: string[]): PastPicksDisplayRow[] {
  const hitIds: string[] = [];
  for (const pick of picks) {
    if (pick.correct && pick.pickId && !hitIds.includes(pick.pickId)) {
      hitIds.push(pick.pickId);
    }
  }

  const remainingActuals = actualIds.filter((id) => !hitIds.includes(id));
  const missCount = picks.filter((p) => !(p.correct && p.pickId)).length;
  const rows: PastPicksDisplayRow[] = [];
  let missIndex = 0;
  let actualCursor = 0;

  for (const pick of picks) {
    if (pick.correct && pick.pickId) {
      if (rows.some((row) => row.kind === "nailed" && row.coupleIds[0] === pick.pickId)) {
        continue;
      }
      rows.push({ kind: "nailed", coupleIds: [pick.pickId] });
      continue;
    }

    missIndex += 1;
    const isLastMiss = missIndex === missCount;
    const assigned = isLastMiss
      ? remainingActuals.slice(actualCursor)
      : remainingActuals.slice(actualCursor, actualCursor + 1);
    if (!isLastMiss) actualCursor += assigned.length;

    rows.push({
      kind: "miss",
      pickIds: pick.pickId ? [pick.pickId] : [],
      actualIds: assigned,
    });
  }

  return rows;
}

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

export type CurtainCallMode = "picks" | "recap";

export type CurtainCallSelection<C extends { id: string }, L extends { id: string } = C> = {
  episode: C | L | null;
  mode: CurtainCallMode | null;
};

// One Your Picks card: default is the live/upcoming week (the pick form).
// A completed ?week= id shows the recap, including unwatched weeks so the
// lock card can prompt. Unknown ids fall back to the live week, then recap.
export function selectCurtainCallWeek<C extends { id: string }, L extends { id: string }>(
  completedEpisodesDesc: C[],
  liveEpisode: L | null,
  allowedEpisodeIds: Set<string>,
  weekParam?: string | null
): CurtainCallSelection<C, L> {
  if (weekParam) {
    if (liveEpisode && weekParam === liveEpisode.id) {
      return { episode: liveEpisode, mode: "picks" };
    }
    const completed = completedEpisodesDesc.find((e) => e.id === weekParam);
    if (completed) return { episode: completed, mode: "recap" };
  }
  if (liveEpisode) return { episode: liveEpisode, mode: "picks" };
  const recap = selectPastPicksEpisode(completedEpisodesDesc, allowedEpisodeIds, null);
  return recap ? { episode: recap, mode: "recap" } : { episode: null, mode: null };
}

export function buildCurtainCallWeeks<E extends { id: string; weekNumber: number }>(
  completed: E[],
  live: E | null
): E[] {
  const weeks = [...completed];
  if (live && !weeks.some((w) => w.id === live.id)) weeks.push(live);
  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
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
