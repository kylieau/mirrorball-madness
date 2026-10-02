// Strong-play season ceilings. Module weights are shares of these ceilings:
// weight 1 on every module means a strong season is worth the same points
// in Dance Card, Curtain Call, and Grand Finale. This is not a standings-
// variance solve, and Grand Finale is not capped below the other modules.
//
// Pure and deterministic. `run.mjs` prints the schema paste; tests import
// `solveStrongPlayCeilings`.

export const TOTAL_COUPLES = 12;
export const FINALE_FIELD = 4; // planning default inside "about 4–5"
export const REFERENCE_ROSTER_SIZE = 3;
export const ROSTER_SIZES = [1, 2, 3, 4, 5, 6];

// One dance per week. Best couple's season-average total, down to the
// first couple out. 30 would be three perfect 10s — not the path we price.
export const JUDGE_BEST = 28;
export const JUDGE_FIRST_OUT = 21;

// Relative placement ladder (1st .. 5th). One scale is solved; the shape
// stays the shipped decay.
export const PLACEMENT_SHAPE = [150, 75, 40, 20, 10];

// Curtain Call's elimination base stays 3:2 against the top-scorer base,
// matching the pre-ceiling defaults (30 and 20). The couples-remaining
// ratio redistributes each base across weeks; it is not a second budget.
export const ELIM_TO_TOP = 3 / 2;

// At the reference roster, how the Dance Card ceiling splits. Judges are
// the weekly spine, survival is the drip, placement is the finale kicker.
// Other roster sizes keep these point values and move only the multiplier.
export const JUDGES_SHARE = 0.65;
export const SURVIVAL_SHARE = 0.25;
export const PLACEMENT_SHARE = 0.1;

// One full share, before the unit change. 1000 unscaled is a 100-point
// season after POINT_SCALE, so a strong week stays in the tens.
export const TARGET_SHARE = 1000;
export const POINT_SCALE = 0.1;

export const DISTANCE_ZERO_AT = 4;
export const BAND_WIDTH = 3;
export const GRADED_BAND_STEP = 0.25;
export const GRADED_BAND_FLOOR = 0.25;

export function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundMultiplier(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function judgeTotalForRank(rank: number): number {
  if (TOTAL_COUPLES <= 1) return JUDGE_BEST;
  const t = (rank - 1) / (TOTAL_COUPLES - 1);
  return JUDGE_BEST + (JUDGE_FIRST_OUT - JUDGE_BEST) * t;
}

// Skill-expected path. Rank 1 is the winner. The finale field dances the
// finale; only the podium (1st–3rd) earns survival that night. 4th dances
// it and is eliminated. Everyone else leaves in rank order, one per week,
// dancing the week they go and earning no survival for it.
export type CouplePath = {
  weeksDanced: number;
  survivalWeeks: number;
  placement: number | null;
};

export function couplePath(rank: number): CouplePath {
  const eliminationWeeks = TOTAL_COUPLES - FINALE_FIELD;
  const danceWeeks = eliminationWeeks + 1;
  if (rank <= 3) {
    return { weeksDanced: danceWeeks, survivalWeeks: danceWeeks, placement: rank };
  }
  if (rank === 4) {
    return { weeksDanced: danceWeeks, survivalWeeks: eliminationWeeks, placement: 4 };
  }
  const weekOut = TOTAL_COUPLES - rank + 1;
  return {
    weeksDanced: weekOut,
    survivalWeeks: weekOut - 1,
    placement: rank === 5 ? 5 : null,
  };
}

// start_draft's split: the cast fills evenly, remainder undrafted.
export function managerCountForRoster(rosterSize: number): number {
  return Math.max(2, Math.floor(TOTAL_COUPLES / rosterSize));
}

// 0-indexed snake slots → 1-indexed longevity ranks (1 = best).
export function snakeSlotRanks(rosterSize: number): number[][] {
  const managers = managerCountForRoster(rosterSize);
  const picks = managers * rosterSize;
  const slots: number[][] = Array.from({ length: managers }, () => []);
  for (let pick = 0; pick < picks; pick++) {
    const round = Math.floor(pick / managers);
    const indexInRound = pick % managers;
    const slot = round % 2 === 0 ? indexInRound : managers - 1 - indexInRound;
    slots[slot].push(pick + 1);
  }
  return slots;
}

// Perfect reads, median seat — not the first-overall roster. An even
// manager count has two central seats; the strong roster is their average.
export function medianSlotIndexes(managerCount: number): number[] {
  const mid = (managerCount - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  return lo === hi ? [lo] : [lo, hi];
}

export function bandFraction(bandIndex: number): number {
  return Math.max(GRADED_BAND_FLOOR, 1 - GRADED_BAND_STEP * bandIndex);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export type DanceCardStructure = {
  ranksBySlot: number[][];
  judgesRaw: number;
  survivalWeeks: number;
  placementUnits: number;
  survivalFraction: number;
};

export function danceCardStructure(rosterSize: number): DanceCardStructure {
  const slots = snakeSlotRanks(rosterSize);
  const indexes = medianSlotIndexes(slots.length);
  const perSlot = indexes.map((index) => {
    let judgesRaw = 0;
    let survivalWeeks = 0;
    let placementUnits = 0;
    let coupleWeeksPossible = 0;
    const danceWeeks = TOTAL_COUPLES - FINALE_FIELD + 1;
    for (const rank of slots[index]) {
      const path = couplePath(rank);
      judgesRaw += judgeTotalForRank(rank) * path.weeksDanced;
      survivalWeeks += path.survivalWeeks;
      coupleWeeksPossible += danceWeeks;
      if (path.placement) placementUnits += PLACEMENT_SHAPE[path.placement - 1];
    }
    return { judgesRaw, survivalWeeks, placementUnits, coupleWeeksPossible, ranks: slots[index] };
  });
  return {
    ranksBySlot: indexes.map((index) => slots[index]),
    judgesRaw: mean(perSlot.map((s) => s.judgesRaw)),
    survivalWeeks: mean(perSlot.map((s) => s.survivalWeeks)),
    placementUnits: mean(perSlot.map((s) => s.placementUnits)),
    survivalFraction: mean(perSlot.map((s) => s.survivalWeeks / s.coupleWeeksPossible)),
  };
}

// Perfect Curtain Call. Elimination guess on each single-elimination week
// before the finale (doubles are not known ahead of time, so they are not
// in the default ceiling). Top-scorer guess every dance week, finale
// included. Payout(week) = base * couplesRemaining / cast.
export function curtainCallFactors(): { elim: number; top: number } {
  const eliminationWeeks = TOTAL_COUPLES - FINALE_FIELD;
  const danceWeeks = eliminationWeeks + 1;
  let elim = 0;
  let top = 0;
  for (let week = 1; week <= danceWeeks; week++) {
    const remaining = TOTAL_COUPLES - (week - 1);
    const ratio = remaining / TOTAL_COUPLES;
    top += ratio;
    if (week <= eliminationWeeks) elim += ratio;
  }
  return { elim, top };
}

// Perfect bracket. exact / distance / equal-band all pay pointsPerCorrect
// once per couple. Graded pays the band fraction for the couple's true band
// (position N = winner = band 0).
export function grandFinaleFactors(): { perCouple: number; graded: number } {
  let graded = 0;
  for (let position = 1; position <= TOTAL_COUPLES; position++) {
    const band = Math.floor((TOTAL_COUPLES - position) / BAND_WIDTH);
    graded += bandFraction(band);
  }
  return { perCouple: TOTAL_COUPLES, graded };
}

// What the scoring engine pays for this rank, using the rounded ladder.
function placementPointsForRank(rank: number, placementPoints: number[]): number {
  const placement = couplePath(rank).placement;
  if (!placement) return 0;
  return placementPoints[placement - 1];
}

export function solveStrongPlayCeilings(): SolvedCeilings {
  const ceiling = TARGET_SHARE * POINT_SCALE;
  const reference = danceCardStructure(REFERENCE_ROSTER_SIZE);
  const survivalPoints = roundPoints((SURVIVAL_SHARE * ceiling) / reference.survivalWeeks);
  const placementScale = (PLACEMENT_SHARE * ceiling) / reference.placementUnits;
  const placementPoints = PLACEMENT_SHAPE.map((shape) => roundPoints(shape * placementScale));

  const factors = curtainCallFactors();
  // elimBase = ELIM_TO_TOP * topBase, and
  // elimBase * elimFactor + topBase * topFactor = ceiling.
  const topScorerPoints = roundPoints(ceiling / (ELIM_TO_TOP * factors.elim + factors.top));
  const eliminationPoints = roundPoints(topScorerPoints * ELIM_TO_TOP);

  const finale = grandFinaleFactors();
  const pointsPerCorrect = {
    exact_position: roundPoints(ceiling / finale.perCouple),
    distance_based: roundPoints(ceiling / finale.perCouple),
    band_tier_equal: roundPoints(ceiling / finale.perCouple),
    band_tier_graded: roundPoints(ceiling / finale.graded),
  };
  const distancePenalty = roundPoints(pointsPerCorrect.distance_based / DISTANCE_ZERO_AT);

  const multipliers = ROSTER_SIZES.map((rosterSize) => {
    const structure = danceCardStructure(rosterSize);
    const placementPaid = mean(
      structure.ranksBySlot.map((ranks) =>
        ranks.reduce((sum, rank) => sum + placementPointsForRank(rank, placementPoints), 0)
      )
    );
    const fixed = survivalPoints * structure.survivalWeeks + placementPaid;
    const multiplier = roundMultiplier((ceiling - fixed) / structure.judgesRaw);
    return { rosterSize, multiplier, structure, fixed, placementPaid };
  });

  return {
    ceiling,
    survivalPoints,
    eliminationPoints,
    topScorerPoints,
    placementPoints,
    pointsPerCorrect,
    distancePenalty,
    multipliers,
    reference,
    curtainCallFactors: factors,
    grandFinaleFactors: finale,
  };
}

export type GrandFinaleCeilingMethod = keyof SolvedCeilings["pointsPerCorrect"];

export type SolvedCeilings = {
  ceiling: number;
  survivalPoints: number;
  eliminationPoints: number;
  topScorerPoints: number;
  placementPoints: number[];
  pointsPerCorrect: {
    exact_position: number;
    distance_based: number;
    band_tier_equal: number;
    band_tier_graded: number;
  };
  distancePenalty: number;
  multipliers: {
    rosterSize: number;
    multiplier: number;
    structure: DanceCardStructure;
    fixed: number;
    placementPaid: number;
  }[];
  reference: DanceCardStructure;
  curtainCallFactors: { elim: number; top: number };
  grandFinaleFactors: { perCouple: number; graded: number };
};

export function curtainCallCeiling(solved: SolvedCeilings): number {
  const { elim, top } = solved.curtainCallFactors;
  return solved.eliminationPoints * elim + solved.topScorerPoints * top;
}

export function grandFinaleCeiling(solved: SolvedCeilings, method: GrandFinaleCeilingMethod): number {
  const ppc = solved.pointsPerCorrect[method];
  if (method === "band_tier_graded") return ppc * solved.grandFinaleFactors.graded;
  return ppc * solved.grandFinaleFactors.perCouple;
}

export function danceCardCeiling(solved: SolvedCeilings, rosterSize: number): number {
  const row = solved.multipliers.find((m) => m.rosterSize === rosterSize);
  if (!row) throw new Error(`no strong-play ceiling for roster size ${rosterSize}`);
  return row.multiplier * row.structure.judgesRaw + row.fixed;
}
