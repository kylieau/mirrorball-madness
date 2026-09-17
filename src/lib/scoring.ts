export type ScoringSettings = {
  judgesScoreMultiplier: number;
  survivalPoints: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  thirdPlacePoints: number;
};

export type RosterSlot = { managerId: string; coupleId: string };

export type DanceScore = { coupleId: string; totalScore: number };

export type Outcome =
  | "safe"
  | "eliminated"
  | "withdrawn"
  | "bye"
  | "winner"
  | "runner_up"
  | "third_place";

export type EpisodeOutcome = {
  coupleId: string;
  outcome: Outcome;
  bonusPoints: number;
};

export type Prediction = {
  managerId: string;
  predictedEliminatedCoupleId: string | null;
  // Only meaningful when isDoubleElimination is true (a manager must guess
  // both couples going home that week, not just one) — ignored otherwise.
  predictedEliminatedCoupleId2: string | null;
  predictedTopScorerCoupleId: string | null;
};

export type WeeklyManagerScore = {
  managerId: string;
  rosterPoints: number;
  predictionPoints: number;
  grandFinalePoints: number;
  totalPoints: number;
};

export type CategoryWeights = {
  judges: number;
  eliminations: number;
  bonus: number;
};

const PODIUM_POINTS_KEY: Record<string, keyof ScoringSettings> = {
  winner: "firstPlacePoints",
  runner_up: "secondPlacePoints",
  third_place: "thirdPlacePoints",
};

// Anything else (safe, winner, runner_up, third_place) earns survival points.
// eliminated: voted off. withdrawn: left mid-season (injury etc.) — didn't
// complete the week, but it's nobody's fault, so just no bonus rather than
// treating it like a vote-off. bye: sat out but still competing overall —
// also no bonus for a week they didn't dance, but see NO_SURVIVAL_OUTCOMES
// vs. the couples.status sync in applyEpisodeResults, where bye is different
// again (doesn't open the roster slot, unlike eliminated/withdrawn).
const NO_SURVIVAL_OUTCOMES = new Set<Outcome>(["eliminated", "withdrawn", "bye"]);

export function sumDanceScoresByCouple(danceScores: DanceScore[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { coupleId, totalScore } of danceScores) {
    totals.set(coupleId, (totals.get(coupleId) ?? 0) + totalScore);
  }
  return totals;
}

// Same notion scoring uses for Curtain Call's top-scorer pick: highest sum
// of dance_scores.total_score that episode, ties all count, a 0-high week
// has no top scorer (nothing danced).
function findTopScorerCoupleIdsFromTotals(totals: Map<string, number>): Set<string> {
  const highestScore = Math.max(0, ...totals.values());
  return new Set(
    [...totals.entries()]
      .filter(([, score]) => score === highestScore && highestScore > 0)
      .map(([coupleId]) => coupleId)
  );
}

export function findTopScorerCoupleIds(danceScores: DanceScore[]): Set<string> {
  return findTopScorerCoupleIdsFromTotals(sumDanceScoresByCouple(danceScores));
}

export function findEliminatedCoupleIds(
  episodeOutcomes: { coupleId: string; outcome: string }[]
): Set<string> {
  return new Set(episodeOutcomes.filter((o) => o.outcome === "eliminated").map((o) => o.coupleId));
}

// Pure and DB-free by design: the caller is responsible for fetching
// already-week-scoped data (e.g. only roster_slots active this week) — this
// function just does the arithmetic, which is what makes it unit-testable
// without a database.
export function computeWeeklyScores({
  scoringSettings,
  rosterSlots,
  danceScores,
  episodeOutcomes,
  predictions,
  isFinale,
  isDoubleElimination,
  categoryWeights = { judges: 1, eliminations: 1, bonus: 1 },
  grandFinalePointsByManager = {},
}: {
  scoringSettings: ScoringSettings;
  rosterSlots: RosterSlot[];
  danceScores: DanceScore[];
  episodeOutcomes: EpisodeOutcome[];
  predictions: Prediction[];
  isFinale: boolean;
  isDoubleElimination: boolean;
  categoryWeights?: CategoryWeights;
  grandFinalePointsByManager?: Record<string, number>;
}): WeeklyManagerScore[] {
  const coupleTotalScore = sumDanceScoresByCouple(danceScores);
  const outcomeByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.outcome]));
  const bonusPointsByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.bonusPoints]));
  const topScorerCoupleIds = findTopScorerCoupleIdsFromTotals(coupleTotalScore);
  const eliminatedCoupleIds = findEliminatedCoupleIds(episodeOutcomes);

  const rosterPointsByManager = new Map<string, number>();
  for (const { managerId, coupleId } of rosterSlots) {
    let points = (coupleTotalScore.get(coupleId) ?? 0) * scoringSettings.judgesScoreMultiplier;

    const outcome = outcomeByCouple.get(coupleId);
    if (outcome && !NO_SURVIVAL_OUTCOMES.has(outcome)) {
      points += scoringSettings.survivalPoints;
    }

    if (isFinale && outcome && outcome in PODIUM_POINTS_KEY) {
      points += scoringSettings[PODIUM_POINTS_KEY[outcome]];
    }

    points += bonusPointsByCouple.get(coupleId) ?? 0;

    rosterPointsByManager.set(managerId, (rosterPointsByManager.get(managerId) ?? 0) + points);
  }

  const predictionPointsByManager = new Map<string, number>();
  for (const p of predictions) {
    let points = 0;
    if (p.predictedEliminatedCoupleId && eliminatedCoupleIds.has(p.predictedEliminatedCoupleId)) {
      points += scoringSettings.eliminationPredictionPoints;
    }
    if (
      isDoubleElimination &&
      p.predictedEliminatedCoupleId2 &&
      eliminatedCoupleIds.has(p.predictedEliminatedCoupleId2)
    ) {
      points += scoringSettings.eliminationPredictionPoints;
    }
    if (p.predictedTopScorerCoupleId && topScorerCoupleIds.has(p.predictedTopScorerCoupleId)) {
      points += scoringSettings.topScorerPredictionPoints;
    }
    predictionPointsByManager.set(
      p.managerId,
      (predictionPointsByManager.get(p.managerId) ?? 0) + points
    );
  }

  const managerIds = new Set([
    ...rosterPointsByManager.keys(),
    ...predictionPointsByManager.keys(),
    ...Object.keys(grandFinalePointsByManager),
  ]);

  return [...managerIds].map((managerId) => {
    const rosterPoints = rosterPointsByManager.get(managerId) ?? 0;
    const predictionPoints = predictionPointsByManager.get(managerId) ?? 0;
    const grandFinalePoints = grandFinalePointsByManager[managerId] ?? 0;
    return {
      managerId,
      rosterPoints,
      predictionPoints,
      grandFinalePoints,
      totalPoints:
        rosterPoints * categoryWeights.judges +
        predictionPoints * categoryWeights.eliminations +
        grandFinalePoints * categoryWeights.bonus,
    };
  });
}

export type GrandFinaleMethod = "exact_position" | "distance_based" | "binary_tier";

export type GrandFinalePrediction = {
  managerId: string;
  coupleId: string;
  predictedPosition: number;
};

export type ResolvedCouple = {
  coupleId: string;
  actualPosition: number;
};

// Pure and DB-free, same design as computeWeeklyScores — the caller resolves
// which couples newly became known this call (see applyEpisodeResults) and
// passes in only those, since a couple's Grand Finale points are earned once,
// the moment its actual position becomes known, not recomputed every week.
export function computeGrandFinalePoints({
  predictions,
  resolvedCouples,
  totalCouples,
  method,
  distancePenalty,
  tierSize,
  pointsPerCorrect,
}: {
  predictions: GrandFinalePrediction[];
  resolvedCouples: ResolvedCouple[];
  totalCouples: number;
  method: GrandFinaleMethod;
  distancePenalty: number | null;
  tierSize: number | null;
  pointsPerCorrect: number;
}): Record<string, number> {
  const actualPositionByCouple = new Map(resolvedCouples.map((r) => [r.coupleId, r.actualPosition]));
  const tierThreshold = totalCouples - (tierSize ?? 0);

  const pointsByManager: Record<string, number> = {};

  for (const p of predictions) {
    const actualPosition = actualPositionByCouple.get(p.coupleId);
    if (actualPosition === undefined) continue;

    let points = 0;
    if (method === "exact_position") {
      points = p.predictedPosition === actualPosition ? pointsPerCorrect : 0;
    } else if (method === "distance_based") {
      const distance = Math.abs(p.predictedPosition - actualPosition);
      points = Math.max(0, pointsPerCorrect - distance * (distancePenalty ?? 0));
    } else if (method === "binary_tier") {
      const predictedInTier = p.predictedPosition > tierThreshold;
      const actualInTier = actualPosition > tierThreshold;
      points = predictedInTier && actualInTier ? pointsPerCorrect : 0;
    }

    pointsByManager[p.managerId] = (pointsByManager[p.managerId] ?? 0) + points;
  }

  return pointsByManager;
}
