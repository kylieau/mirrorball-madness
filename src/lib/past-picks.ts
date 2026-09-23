import {
  classifyEliminationGuess,
  classifyTopScorerGuess,
  findEliminatedCoupleIds,
  findTopScorerCoupleIds,
  resolveCurtainCallGuess,
  sumDanceScoresByCouple,
  type CurtainCallVerdict,
  type DanceScore,
} from "./scoring";

export type PickMatch = {
  pickId: string | null;
  verdict: CurtainCallVerdict;
  points: number;
};

export type PastPicksComparison = {
  eliminationPicks: PickMatch[];
  actualEliminatedIds: string[];
  topScorer: PickMatch;
  actualTopScorerIds: string[];
  predictionPoints: number;
};

export type PastPicksDisplayRow =
  | { kind: "nailed"; coupleIds: string[]; points: number }
  | { kind: "in_jeopardy"; pickIds: string[]; actualIds: string[]; points: number }
  | { kind: "miss"; pickIds: string[]; actualIds: string[] };

// Layout A for hits: one "Nailed It" line so the couple isn't printed twice.
// Layout 2 for misses: one strike→actual line per slot (no stacked Actual row).
// Double-elim slots collapse independently, in slot order.
function isExact(pick: PickMatch): boolean {
  return pick.verdict === "exact" && !!pick.pickId;
}

export function collapsePickRows(picks: PickMatch[], actualIds: string[]): PastPicksDisplayRow[] {
  const hitIds: string[] = [];
  for (const pick of picks) {
    if (isExact(pick) && !hitIds.includes(pick.pickId!)) {
      hitIds.push(pick.pickId!);
    }
  }

  const remainingActuals = actualIds.filter((id) => !hitIds.includes(id));
  const missCount = picks.filter((p) => !isExact(p)).length;
  const rows: PastPicksDisplayRow[] = [];
  let missIndex = 0;
  let actualCursor = 0;

  for (const pick of picks) {
    if (isExact(pick)) {
      if (rows.some((row) => row.kind === "nailed" && row.coupleIds[0] === pick.pickId)) {
        continue;
      }
      rows.push({ kind: "nailed", coupleIds: [pick.pickId!], points: pick.points });
      continue;
    }

    missIndex += 1;
    const isLastMiss = missIndex === missCount;
    const assigned = isLastMiss
      ? remainingActuals.slice(actualCursor)
      : remainingActuals.slice(actualCursor, actualCursor + 1);
    if (!isLastMiss) actualCursor += assigned.length;

    const pickIds = pick.pickId ? [pick.pickId] : [];
    if (pick.verdict === "near_miss") {
      rows.push({ kind: "in_jeopardy", pickIds, actualIds: assigned, points: pick.points });
      continue;
    }
    rows.push({ kind: "miss", pickIds, actualIds: assigned });
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

// One Picks / Curtain Call card: default is the live/upcoming week (the pick form).
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

function scoredGuess(
  pickId: string | null,
  verdict: CurtainCallVerdict,
  exactPayout: number,
  nearMissEnabled: boolean
): PickMatch {
  const resolved = resolveCurtainCallGuess(verdict, exactPayout, nearMissEnabled);
  return { pickId, verdict: resolved.verdict, points: resolved.points };
}

export function matchEliminationPicks({
  predictedEliminatedCoupleId,
  predictedEliminatedCoupleId2,
  isDoubleElimination,
  eliminatedCoupleIds,
  inJeopardyCoupleIds = [],
  exactPayout,
  nearMissEnabled,
}: {
  predictedEliminatedCoupleId: string | null;
  predictedEliminatedCoupleId2: string | null;
  isDoubleElimination: boolean;
  eliminatedCoupleIds: Iterable<string>;
  inJeopardyCoupleIds?: Iterable<string>;
  exactPayout: number;
  nearMissEnabled: boolean;
}): PickMatch[] {
  const actual = eliminatedCoupleIds instanceof Set ? eliminatedCoupleIds : new Set(eliminatedCoupleIds);
  const inJeopardy = inJeopardyCoupleIds instanceof Set ? inJeopardyCoupleIds : new Set(inJeopardyCoupleIds);
  const first = scoredGuess(
    predictedEliminatedCoupleId,
    classifyEliminationGuess(predictedEliminatedCoupleId, actual, inJeopardy),
    exactPayout,
    nearMissEnabled
  );
  if (!isDoubleElimination) return [first];
  return [
    first,
    scoredGuess(
      predictedEliminatedCoupleId2,
      classifyEliminationGuess(predictedEliminatedCoupleId2, actual, inJeopardy),
      exactPayout,
      nearMissEnabled
    ),
  ];
}

export function matchTopScorerPick({
  predictedTopScorerCoupleId,
  danceScores,
  exactPayout,
  nearMissEnabled,
}: {
  predictedTopScorerCoupleId: string | null;
  danceScores: DanceScore[];
  exactPayout: number;
  nearMissEnabled: boolean;
}): PickMatch {
  return scoredGuess(
    predictedTopScorerCoupleId,
    classifyTopScorerGuess(predictedTopScorerCoupleId, sumDanceScoresByCouple(danceScores)),
    exactPayout,
    nearMissEnabled
  );
}

export function buildPastPicksComparison({
  isDoubleElimination,
  predictedEliminatedCoupleId,
  predictedEliminatedCoupleId2,
  predictedTopScorerCoupleId,
  episodeOutcomes,
  danceScores,
  predictionPoints,
  inJeopardyCoupleIds = [],
  nearMissEnabled,
  eliminationExactPayout,
  topScorerExactPayout,
}: {
  isDoubleElimination: boolean;
  predictedEliminatedCoupleId: string | null;
  predictedEliminatedCoupleId2: string | null;
  predictedTopScorerCoupleId: string | null;
  episodeOutcomes: { coupleId: string; outcome: string }[];
  danceScores: DanceScore[];
  predictionPoints: number | null;
  inJeopardyCoupleIds?: Iterable<string>;
  nearMissEnabled: boolean;
  eliminationExactPayout: number;
  topScorerExactPayout: number;
}): PastPicksComparison {
  const eliminatedCoupleIds = findEliminatedCoupleIds(episodeOutcomes);
  const topScorerCoupleIds = findTopScorerCoupleIds(danceScores);
  return {
    eliminationPicks: matchEliminationPicks({
      predictedEliminatedCoupleId,
      predictedEliminatedCoupleId2,
      isDoubleElimination,
      eliminatedCoupleIds,
      inJeopardyCoupleIds,
      exactPayout: eliminationExactPayout,
      nearMissEnabled,
    }),
    actualEliminatedIds: [...eliminatedCoupleIds],
    topScorer: matchTopScorerPick({
      predictedTopScorerCoupleId,
      danceScores,
      exactPayout: topScorerExactPayout,
      nearMissEnabled,
    }),
    actualTopScorerIds: [...topScorerCoupleIds],
    // Stored week total — not recomputed here. In Jeopardy credit lands in
    // this number on the next publish, not on historical rows by itself.
    predictionPoints: predictionPoints ?? 0,
  };
}
