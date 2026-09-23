export type ScoringSettings = {
  judgesScoreMultiplier: number;
  survivalPoints: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  // Placement bonus: a rostered couple finishing in the finale's top 5 —
  // see DANCE_CARD_PLACEMENT_KEY below.
  firstPlacePoints: number;
  secondPlacePoints: number;
  thirdPlacePoints: number;
  fourthPlacePoints: number;
  fifthPlacePoints: number;
  // On by default. Partial credit is a hardcoded 25% (curtainCallNearMissPoints),
  // not a commissioner-editable fraction.
  curtainCallNearMissEnabled: boolean;
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
  // 1 = winner .. 5 = fifth place, null otherwise. Caller-supplied (from the
  // same finale-position computation results.ts already does for the
  // full-order Grand Finale prediction) — keeps this module ignorant of
  // season-wide couple counts, which it has no other reason to know.
  finalPlacement: number | null;
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

// Dance Card's placement bonus, keyed by numeric finalPlacement (1..5)
// rather than by Outcome — a couple's 4th/5th place finish isn't a distinct
// couples.status value, it's derived from the same elimination-order
// ranking Grand Finale's full-order prediction already resolves against.
const DANCE_CARD_PLACEMENT_KEY: Record<
  number,
  | "firstPlacePoints"
  | "secondPlacePoints"
  | "thirdPlacePoints"
  | "fourthPlacePoints"
  | "fifthPlacePoints"
> = {
  1: "firstPlacePoints",
  2: "secondPlacePoints",
  3: "thirdPlacePoints",
  4: "fourthPlacePoints",
  5: "fifthPlacePoints",
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

// Curtain Call's weekly picks pay out proportional to how many couples were
// still in the running when the pick was made — correctly calling an
// elimination from 12 couples is harder, and worth more, than from 4.
// basePoints is a season-average target (elimination_prediction_points /
// top_scorer_prediction_points): this ratio redistributes it across weeks
// rather than changing the season total. Exported so the picking UI can
// render the identical preview number.
export function curtainCallPayout(basePoints: number, couplesRemaining: number, totalCouples: number): number {
  if (totalCouples <= 0) return basePoints;
  return basePoints * (couplesRemaining / totalCouples);
}

// Hardcoded. Commissioners can turn In Jeopardy off; they cannot change this.
export const CURTAIN_CALL_NEAR_MISS_FRACTION = 0.25;

export type CurtainCallVerdict = "exact" | "near_miss" | "miss";

// Whole points. Floors the unrounded exact payout (curtainCallPayout), not a
// rounded display value — 15.5 × 0.25 is 3, not 4.
export function curtainCallNearMissPoints(exactPayout: number): number {
  return Math.floor(exactPayout * CURTAIN_CALL_NEAR_MISS_FRACTION);
}

export function couplesRemainingAtWeek(
  couples: { eliminationWeek: number | null }[],
  weekNumber: number
): number {
  const alreadyOut = couples.filter(
    (c) => c.eliminationWeek !== null && c.eliminationWeek < weekNumber
  ).length;
  return couples.length - alreadyOut;
}

// Eliminated couples are exact, never In Jeopardy, even if a tick came along.
export function inJeopardyIdsToPersist(
  coupleIds: string[],
  entries: { coupleId: string; outcome: string }[]
): string[] {
  const eliminated = new Set(entries.filter((e) => e.outcome === "eliminated").map((e) => e.coupleId));
  return [...new Set(coupleIds.filter((id) => !eliminated.has(id)))];
}

export function classifyEliminationGuess(
  guessId: string | null,
  eliminatedIds: Set<string>,
  inJeopardyIds: Set<string>
): CurtainCallVerdict {
  if (!guessId) return "miss";
  if (eliminatedIds.has(guessId)) return "exact";
  if (inJeopardyIds.has(guessId)) return "near_miss";
  return "miss";
}

// Exact = tied for the week high M (and M > 0). Near-miss = total in [M−1, M).
// A couple with no dance_scores row is absent from `totals` and cannot near-miss,
// including a bye. Ties at M are exact only.
export function classifyTopScorerGuess(
  guessId: string | null,
  totals: Map<string, number>
): CurtainCallVerdict {
  if (!guessId) return "miss";
  const topScorerIds = findTopScorerCoupleIdsFromTotals(totals);
  if (topScorerIds.has(guessId)) return "exact";
  if (!totals.has(guessId)) return "miss";
  const high = Math.max(0, ...totals.values());
  const score = totals.get(guessId)!;
  if (high > 0 && score >= high - 1 && score < high) return "near_miss";
  return "miss";
}

export function resolveCurtainCallGuess(
  verdict: CurtainCallVerdict,
  exactPayout: number,
  nearMissEnabled: boolean
): { verdict: CurtainCallVerdict; points: number } {
  if (verdict === "exact") return { verdict: "exact", points: exactPayout };
  if (verdict === "near_miss" && nearMissEnabled) {
    return { verdict: "near_miss", points: curtainCallNearMissPoints(exactPayout) };
  }
  return { verdict: "miss", points: 0 };
}

export function curtainCallPreviewCopy({
  kind,
  exactDisplayPoints,
  nearMissPoints,
  nearMissEnabled,
  couplesRemaining,
}: {
  kind: "elimination" | "top_scorer";
  exactDisplayPoints: number;
  nearMissPoints: number;
  nearMissEnabled: boolean;
  couplesRemaining: number;
}): string {
  const exactLabel = kind === "elimination" ? "Correct elimination" : "Correct top scorer";
  const nearClause = kind === "elimination" ? "if In Jeopardy" : "if within 1 of the high";
  const couplesLeft = `${couplesRemaining} couple${couplesRemaining === 1 ? "" : "s"} left`;
  const near = nearMissEnabled ? ` · ${nearMissPoints} pts ${nearClause}` : "";
  return `${exactLabel}: ${exactDisplayPoints} pts${near} · ${couplesLeft}`;
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
  isDoubleElimination,
  couplesRemaining,
  totalCouples,
  categoryWeights = { judges: 1, eliminations: 1, bonus: 1 },
  grandFinalePointsByManager = {},
  inJeopardyCoupleIds = [],
}: {
  scoringSettings: ScoringSettings;
  rosterSlots: RosterSlot[];
  danceScores: DanceScore[];
  episodeOutcomes: EpisodeOutcome[];
  predictions: Prediction[];
  isDoubleElimination: boolean;
  couplesRemaining: number;
  totalCouples: number;
  categoryWeights?: CategoryWeights;
  grandFinalePointsByManager?: Record<string, number>;
  // Commissioner ticks on Enter Results, unioned across the week's episodes.
  // Not inferred from judges scores.
  inJeopardyCoupleIds?: string[];
}): WeeklyManagerScore[] {
  const coupleTotalScore = sumDanceScoresByCouple(danceScores);
  const outcomeByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.outcome]));
  const bonusPointsByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.bonusPoints]));
  const finalPlacementByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.finalPlacement]));
  const eliminatedCoupleIds = findEliminatedCoupleIds(episodeOutcomes);
  const inJeopardyIds = new Set(inJeopardyCoupleIds);
  const nearMissEnabled = scoringSettings.curtainCallNearMissEnabled;
  const eliminationExact = curtainCallPayout(
    scoringSettings.eliminationPredictionPoints,
    couplesRemaining,
    totalCouples
  );
  const topScorerExact = curtainCallPayout(
    scoringSettings.topScorerPredictionPoints,
    couplesRemaining,
    totalCouples
  );

  const rosterPointsByManager = new Map<string, number>();
  for (const { managerId, coupleId } of rosterSlots) {
    let points = (coupleTotalScore.get(coupleId) ?? 0) * scoringSettings.judgesScoreMultiplier;

    const outcome = outcomeByCouple.get(coupleId);
    if (outcome && !NO_SURVIVAL_OUTCOMES.has(outcome)) {
      points += scoringSettings.survivalPoints;
    }

    const finalPlacement = finalPlacementByCouple.get(coupleId);
    if (finalPlacement && finalPlacement in DANCE_CARD_PLACEMENT_KEY) {
      points += scoringSettings[DANCE_CARD_PLACEMENT_KEY[finalPlacement]];
    }

    points += bonusPointsByCouple.get(coupleId) ?? 0;

    rosterPointsByManager.set(managerId, (rosterPointsByManager.get(managerId) ?? 0) + points);
  }

  const predictionPointsByManager = new Map<string, number>();
  for (const p of predictions) {
    let points = 0;
    points += resolveCurtainCallGuess(
      classifyEliminationGuess(p.predictedEliminatedCoupleId, eliminatedCoupleIds, inJeopardyIds),
      eliminationExact,
      nearMissEnabled
    ).points;
    if (isDoubleElimination) {
      points += resolveCurtainCallGuess(
        classifyEliminationGuess(p.predictedEliminatedCoupleId2, eliminatedCoupleIds, inJeopardyIds),
        eliminationExact,
        nearMissEnabled
      ).points;
    }
    points += resolveCurtainCallGuess(
      classifyTopScorerGuess(p.predictedTopScorerCoupleId, coupleTotalScore),
      topScorerExact,
      nearMissEnabled
    ).points;
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

export type GrandFinaleMethod = "exact_position" | "distance_based" | "band_tier";

export type TierPayStyle = "equal" | "graded";

const GRADED_BAND_STEP = 0.25;
const GRADED_BAND_FLOOR = 0.25;

// Position `totalCouples` is the winner and lands in band 0; bands are
// `tierSize` couples wide, counted down from the winner, so a cast that
// doesn't divide evenly leaves the smallest band at the bottom.
export function bandOf(position: number, totalCouples: number, tierSize: number): number {
  return Math.floor((totalCouples - position) / Math.max(1, tierSize));
}

export function bandPayoutFraction(bandIndex: number, payStyle: TierPayStyle): number {
  if (payStyle === "equal") return 1;
  return Math.max(GRADED_BAND_FLOOR, 1 - GRADED_BAND_STEP * bandIndex);
}

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
  tierPayStyle,
  pointsPerCorrect,
}: {
  predictions: GrandFinalePrediction[];
  resolvedCouples: ResolvedCouple[];
  totalCouples: number;
  method: GrandFinaleMethod;
  distancePenalty: number | null;
  tierSize: number | null;
  tierPayStyle: TierPayStyle;
  pointsPerCorrect: number;
}): Record<string, number> {
  const actualPositionByCouple = new Map(resolvedCouples.map((r) => [r.coupleId, r.actualPosition]));

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
    } else if (method === "band_tier") {
      const width = tierSize ?? 1;
      const actualBand = bandOf(actualPosition, totalCouples, width);
      if (bandOf(p.predictedPosition, totalCouples, width) === actualBand) {
        points = pointsPerCorrect * bandPayoutFraction(actualBand, tierPayStyle);
      }
    }

    pointsByManager[p.managerId] = (pointsByManager[p.managerId] ?? 0) + points;
  }

  return pointsByManager;
}
