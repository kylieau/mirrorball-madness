import { roundPoints, formatPoints } from "./format-points";

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
  // On by default. Partial credit is hardcoded (curtainCallNearMissPoints /
  // curtainCallNearMiss2Points), not a commissioner-editable fraction.
  curtainCallNearMissEnabled: boolean;
};

// A league's stored scoring_settings row as the engine reads it.
export function scoringSettingsFromRow(row: {
  judges_score_multiplier: number;
  survival_points: number;
  elimination_prediction_points: number;
  top_scorer_prediction_points: number;
  first_place_points: number;
  second_place_points: number;
  third_place_points: number;
  fourth_place_points: number;
  fifth_place_points: number;
  curtain_call_near_miss_enabled: boolean | null;
}): ScoringSettings {
  return {
    judgesScoreMultiplier: row.judges_score_multiplier,
    survivalPoints: row.survival_points,
    eliminationPredictionPoints: row.elimination_prediction_points,
    topScorerPredictionPoints: row.top_scorer_prediction_points,
    firstPlacePoints: row.first_place_points,
    secondPlacePoints: row.second_place_points,
    thirdPlacePoints: row.third_place_points,
    fourthPlacePoints: row.fourth_place_points,
    fifthPlacePoints: row.fifth_place_points,
    curtainCallNearMissEnabled: row.curtain_call_near_miss_enabled !== false,
  };
}

export type RosterSlot = { managerId: string; coupleId: string };

// One dance. totalScore is the raw judges' sum fans see (Curtain Call's top
// scorer compares it within one night). scaledScore is that dance's marks
// over the marks possible on the 30-point basis, so a guest-judge night isn't
// worth a third more. maxScore is the marks possible: null for a legacy row
// (recovered through judgeCountForDance), judges × per-judge max for a
// special dance scored by marks, and 0 for a bonus round scored in points.
// episodeId is required because Dance Card pays a couple once per night, not
// once per dance — see collapseToNights.
export type DanceScore = {
  episodeId: string;
  coupleId: string;
  totalScore: number;
  scaledScore: number;
  maxScore: number | null;
  // Set on a special dance's row (dance_scores.team_id), which a couple's
  // released draft never replaces.
  teamId?: string | null;
};

export const STANDING_PANEL_SIZE = 3;
export const MARK_MAX = 10;
export const DANCE_CARD_BASIS = STANDING_PANEL_SIZE * MARK_MAX;

// Marks over the marks possible, on the 30-point basis. With the default
// per-judge max of 10 this is the judges' average × 3.
export function scaledJudgesScore(judgeScores: number[], maxPerJudge: number = MARK_MAX): number {
  if (judgeScores.length === 0 || !(maxPerJudge > 0)) return 0;
  const total = judgeScores.reduce((sum, score) => sum + score, 0);
  return (total * DANCE_CARD_BASIS) / (judgeScores.length * maxPerJudge);
}

// One couple's one night. scaledScore is what Dance Card pays on: every mark
// the couple received that night, plus any bonus-round points, over every
// mark possible (judges × per-judge max per dance), on the 30-point basis. A
// 28/40 plus a 36/40 is 64/80 → 24, the same as a single 24/30 — not 21 + 27.
// maxScore is that denominator; bonus points sit in the numerator only, so a
// night with a bonus round can pay above 30. bonusScore is the part of
// totalScore that came from points rather than marks.
export type NightScore = {
  episodeId: string;
  coupleId: string;
  totalScore: number;
  scaledScore: number;
  maxScore: number;
  bonusScore: number;
  danceCount: number;
};

// A stored row keeps scaled = total × 3 / judges, so the panel size behind it
// is recoverable without the judge rows. A dance with no marks (0/0) has no
// panel to recover.
export function judgeCountForDance(dance: Pick<DanceScore, "totalScore" | "scaledScore">): number | null {
  if (!(dance.scaledScore > 0)) return null;
  const judges = Math.round((dance.totalScore * STANDING_PANEL_SIZE) / dance.scaledScore);
  return judges >= 1 ? judges : null;
}

function isPointsRow(dance: Pick<DanceScore, "maxScore">): boolean {
  return dance.maxScore === 0;
}

// The panel behind one dance when it is known: a legacy row recovers it from
// its stored scale, an out-of-10 special dance from its maxScore. A dance on
// another scale, or with no marks, says nothing about the night's panel.
function panelVote(dance: DanceScore): number | null {
  if (dance.maxScore === null) return judgeCountForDance(dance);
  if (!(dance.maxScore > 0)) return null;
  const judges = dance.maxScore / MARK_MAX;
  return Number.isInteger(judges) ? judges : null;
}

// Dance Card's per-night rule. A night with one legacy dance keeps its stored
// scaledScore untouched, so single-dance weeks score exactly as they always
// have. Any other night pays once on the combined marks, never rounded here
// (the multiplier is applied downstream). A 0-mark legacy dance borrows the
// panel size most dances used that night, else the standing three; a night
// that holds only bonus points is paid against one standard dance on that
// same panel.
export function collapseToNights(danceScores: DanceScore[]): NightScore[] {
  const panelVotes = new Map<string, Map<number, number>>();
  for (const dance of danceScores) {
    const judges = panelVote(dance);
    if (judges === null) continue;
    const votes = panelVotes.get(dance.episodeId) ?? new Map<number, number>();
    votes.set(judges, (votes.get(judges) ?? 0) + 1);
    panelVotes.set(dance.episodeId, votes);
  }
  const usualPanel = (episodeId: string) => {
    let best = STANDING_PANEL_SIZE;
    let bestVotes = 0;
    for (const [judges, count] of panelVotes.get(episodeId) ?? []) {
      if (count > bestVotes) [best, bestVotes] = [judges, count];
    }
    return best;
  };
  const danceMax = (dance: DanceScore) =>
    dance.maxScore ?? (judgeCountForDance(dance) ?? usualPanel(dance.episodeId)) * MARK_MAX;

  const nights = new Map<string, DanceScore[]>();
  for (const dance of danceScores) {
    const key = `${dance.episodeId}:${dance.coupleId}`;
    nights.set(key, [...(nights.get(key) ?? []), dance]);
  }
  return [...nights.values()].map((dances) => {
    const { episodeId, coupleId } = dances[0];
    const totalScore = dances.reduce((sum, d) => sum + d.totalScore, 0);
    const bonusScore = dances.reduce((sum, d) => sum + (isPointsRow(d) ? d.totalScore : 0), 0);
    const marksMax = dances.reduce((sum, d) => sum + danceMax(d), 0);
    const maxScore = marksMax > 0 ? marksMax : usualPanel(episodeId) * MARK_MAX;
    const scaledScore =
      dances.length === 1 && dances[0].maxScore === null
        ? dances[0].scaledScore
        : (totalScore * DANCE_CARD_BASIS) / maxScore;
    return { episodeId, coupleId, totalScore, scaledScore, maxScore, bonusScore, danceCount: dances.length };
  });
}

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
  // The Finale week only, where the podium replaces the elimination pick
  // (submit_podium_prediction).
  predictedPodiumCoupleIds?: PodiumPick;
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
export const DANCE_CARD_PLACEMENT_KEY: Record<
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
// vs. the couples.status sync in buildPublicationPlan, where bye is different
// again (doesn't open the roster slot, unlike eliminated/withdrawn).
export const NO_SURVIVAL_OUTCOMES = new Set<Outcome>(["eliminated", "withdrawn", "bye"]);

// Outcomes that fix a couple's final position, which is when its Grand Finale
// picks pay out.
export const RESOLVING_OUTCOMES = new Set<Outcome>(["eliminated", "withdrawn", "winner", "runner_up", "third_place"]);

export type RawDanceScore = Pick<DanceScore, "coupleId" | "totalScore">;

export function sumDanceScoresByCouple(danceScores: RawDanceScore[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { coupleId, totalScore } of danceScores) {
    totals.set(coupleId, (totals.get(coupleId) ?? 0) + totalScore);
  }
  return totals;
}

// Dance Card judges basis per couple across whatever rows are passed (one
// week, usually): each night collapsed first, then nights added up, so a
// two-night week pays each night once. Every reader that turns dance rows
// into judges points goes through here, never through a raw sum of
// scaledScore.
export function nightScaledScoresByCouple(danceScores: DanceScore[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { coupleId, scaledScore } of collapseToNights(danceScores)) {
    totals.set(coupleId, (totals.get(coupleId) ?? 0) + scaledScore);
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

export function findTopScorerCoupleIds(danceScores: RawDanceScore[]): Set<string> {
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

// Hardcoded. Commissioners can turn In Jeopardy off; they cannot change these.
// near_miss covers an In Jeopardy elim pick and a top scorer within 1 of the
// high; near_miss_2 is top scorer only, within 2 — two bands, no further.
export const CURTAIN_CALL_NEAR_MISS_FRACTION = 0.25;
export const CURTAIN_CALL_NEAR_MISS_2_FRACTION = 0.1;

export type CurtainCallVerdict = "exact" | "near_miss" | "near_miss_2" | "miss";

// Two-decimal points, taken from the unrounded exact payout (curtainCallPayout)
// so the near-miss figure never compounds a rounding step.
export function curtainCallNearMissPoints(exactPayout: number): number {
  return roundPoints(exactPayout * CURTAIN_CALL_NEAR_MISS_FRACTION);
}

export function curtainCallNearMiss2Points(exactPayout: number): number {
  return roundPoints(exactPayout * CURTAIN_CALL_NEAR_MISS_2_FRACTION);
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

// Exact = tied for the week high M (and M > 0). Near-miss = total in [M−1, M);
// near-miss 2 = total in [M−2, M−1). A couple with no dance_scores row is
// absent from `totals` and cannot near-miss, including a bye. Ties at M are
// exact only.
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
  if (high > 0 && score >= high - 2 && score < high - 1) return "near_miss_2";
  return "miss";
}

export function resolveCurtainCallGuess(
  verdict: CurtainCallVerdict,
  exactPayout: number,
  nearMissEnabled: boolean
): { verdict: CurtainCallVerdict; points: number } {
  if (verdict === "exact") return { verdict: "exact", points: roundPoints(exactPayout) };
  if (verdict === "near_miss" && nearMissEnabled) {
    return { verdict: "near_miss", points: curtainCallNearMissPoints(exactPayout) };
  }
  if (verdict === "near_miss_2" && nearMissEnabled) {
    return { verdict: "near_miss_2", points: curtainCallNearMiss2Points(exactPayout) };
  }
  return { verdict: "miss", points: 0 };
}

// The Finale's Curtain Call (Kylie, 2026-11-11): nobody goes home, so the
// elimination pick becomes the podium, one pick per place, each worth that
// week's elimination payout. Every place a pick is off costs this share of
// it, whatever the In Jeopardy setting.
export const PODIUM_PLACE_OFF_FRACTION = 0.5;

// [winner, runner-up, third place]
export type PodiumPick = [string | null, string | null, string | null];
export const PODIUM_PLACE_LABELS = ["Winner", "Runner-Up", "Third Place"] as const;

const PODIUM_PLACE_BY_OUTCOME: Partial<Record<string, number>> = {
  winner: 1,
  runner_up: 2,
  third_place: 3,
  eliminated: 4,
};

// Where each finalist finished, once a winner is named. The show places only
// three couples, so every other finalist counts as fourth; a couple that
// withdrew has no place. The last row per couple decides, as in the engine.
export function podiumPlaceByCouple(outcomes: { coupleId: string; outcome: string }[]): Map<string, number> {
  const outcomeByCouple = new Map(outcomes.map((o) => [o.coupleId, o.outcome]));
  const places = new Map<string, number>();
  if (![...outcomeByCouple.values()].includes("winner")) return places;
  for (const [coupleId, outcome] of outcomeByCouple) {
    const place = PODIUM_PLACE_BY_OUTCOME[outcome];
    if (place) places.set(coupleId, place);
  }
  return places;
}

export function podiumPickPoints(exactPayout: number, placesOff: number): number {
  return roundPoints(exactPayout * Math.max(0, 1 - placesOff * PODIUM_PLACE_OFF_FRACTION));
}

// placesOff is null for no pick, a couple with no place, or a podium that
// isn't settled yet.
export function resolvePodiumGuess(
  guessId: string | null,
  place: number,
  placeByCouple: Map<string, number>,
  exactPayout: number
): { placesOff: number | null; points: number } {
  const actual = guessId ? placeByCouple.get(guessId) : undefined;
  if (actual === undefined) return { placesOff: null, points: 0 };
  const placesOff = Math.abs(actual - place);
  return { placesOff, points: podiumPickPoints(exactPayout, placesOff) };
}

export function podiumOffLabel(placesOff: number): string {
  return `Off ${placesOff} ${placesOff === 1 ? "place" : "places"}`;
}

export function podiumPreviewCopy(exactPayout: number): string {
  const parts = [`Each place: ${formatPoints(exactPayout)} pts`];
  const oneOff = podiumPickPoints(exactPayout, 1);
  const twoOff = podiumPickPoints(exactPayout, 2);
  if (oneOff > 0) parts.push(`${formatPoints(oneOff)} pts if one place off`);
  if (twoOff > 0) parts.push(`${formatPoints(twoOff)} pts if two off`);
  return parts.join(" · ");
}

export function podiumRuleNote(): string {
  const partial = [1, 2]
    .map((placesOff) => ({ placesOff, percent: podiumPickPoints(100, placesOff) }))
    .filter(({ percent }) => percent > 0)
    .map(({ placesOff, percent }) => `${Math.round(percent)}% of it ${placesOff === 1 ? "one place" : "two places"} off`);
  return `Nobody goes home in the Finale, so the elimination pick becomes the podium: Winner, Runner-Up and Third Place each pay what an elimination pick would that week, or ${partial.join(", ")}.`;
}

export function curtainCallPreviewCopy({
  kind,
  exactDisplayPoints,
  nearMissPoints,
  nearMiss2Points,
  nearMissEnabled,
}: {
  kind: "elimination" | "top_scorer";
  exactDisplayPoints: number;
  nearMissPoints: number;
  // Top scorer only; the elim pick has no second band.
  nearMiss2Points?: number;
  nearMissEnabled: boolean;
}): string {
  const exactLabel = kind === "elimination" ? "Correct elimination" : "Correct top scorer";
  let near = "";
  if (nearMissEnabled) {
    near =
      kind === "elimination"
        ? ` · ${formatPoints(nearMissPoints)} pts if In Jeopardy`
        : ` · ${formatPoints(nearMissPoints)} pts within 1 of the high · ${formatPoints(nearMiss2Points ?? 0)} pts within 2`;
  }
  return `${exactLabel}: ${formatPoints(exactDisplayPoints)} pts${near}`;
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
  danceCardCreditByCouple,
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
  // Dance Card v2 (dance-card-v2.ts): each couple's credit this week, which
  // replaces judges × multiplier, survival, placement and the flat bonus.
  danceCardCreditByCouple?: Map<string, number>;
}): WeeklyManagerScore[] {
  // Top scorer compares the combined raw total; Dance Card pays per night.
  const coupleTotalScore = sumDanceScoresByCouple(danceScores);
  const coupleScaledScore = nightScaledScoresByCouple(danceScores);
  const outcomeByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.outcome]));
  const bonusPointsByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.bonusPoints]));
  const finalPlacementByCouple = new Map(episodeOutcomes.map((o) => [o.coupleId, o.finalPlacement]));
  const eliminatedCoupleIds = findEliminatedCoupleIds(episodeOutcomes);
  const inJeopardyIds = new Set(inJeopardyCoupleIds);
  const podiumPlaces = podiumPlaceByCouple(episodeOutcomes);
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
    if (danceCardCreditByCouple) {
      const credit = danceCardCreditByCouple.get(coupleId) ?? 0;
      rosterPointsByManager.set(managerId, (rosterPointsByManager.get(managerId) ?? 0) + credit);
      continue;
    }
    let points = (coupleScaledScore.get(coupleId) ?? 0) * scoringSettings.judgesScoreMultiplier;

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
    (p.predictedPodiumCoupleIds ?? []).forEach((coupleId, index) => {
      points += resolvePodiumGuess(coupleId, index + 1, podiumPlaces, eliminationExact).points;
    });
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
    const rosterPoints = roundPoints(rosterPointsByManager.get(managerId) ?? 0);
    const predictionPoints = roundPoints(predictionPointsByManager.get(managerId) ?? 0);
    const grandFinalePoints = roundPoints(grandFinalePointsByManager[managerId] ?? 0);
    return {
      managerId,
      rosterPoints,
      predictionPoints,
      grandFinalePoints,
      totalPoints: roundPoints(
        rosterPoints * categoryWeights.judges +
          predictionPoints * categoryWeights.eliminations +
          grandFinalePoints * categoryWeights.bonus
      ),
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
  // Last position of a multi-couple elimination week; absent for a single one.
  actualPositionEnd?: number;
};

// Which week each spot of the elimination order falls in: a week that has
// happened holds the couples it actually sent home (two for a double, none
// for a week without an elimination), a later week one, and every spot left
// is the Finale. finaleSpots is how many that is.
export type SlotWeeks = { weekOf: (position: number) => number; finaleWeek: number; finaleSpots: number };

export function slotWeeks(
  couples: { status: string; elimination_week: number | null }[],
  { finaleWeek, completedThroughWeek }: { finaleWeek: number; completedThroughWeek: number }
): SlotWeeks {
  // Only weeks through completedThroughWeek count as they happened, so a
  // week's payout never moves when later weeks air, and a viewer who is
  // behind learns nothing from them.
  const outByWeek = new Map<number, number>();
  for (const c of couples) {
    if ((c.status === "eliminated" || c.status === "withdrawn") && c.elimination_week !== null && c.elimination_week <= completedThroughWeek) {
      outByWeek.set(c.elimination_week, (outByWeek.get(c.elimination_week) ?? 0) + 1);
    }
  }
  const spotsIn = (week: number) => (week <= completedThroughWeek ? (outByWeek.get(week) ?? 0) : 1);
  let spotsBeforeFinale = 0;
  for (let week = 1; week < finaleWeek; week++) spotsBeforeFinale += spotsIn(week);
  return {
    finaleWeek,
    finaleSpots: Math.max(1, couples.length - spotsBeforeFinale),
    weekOf(position) {
      let spots = 0;
      for (let week = 1; week < finaleWeek; week++) {
        spots += spotsIn(week);
        if (position <= spots) return week;
      }
      return finaleWeek;
    },
  };
}

type GrandFinaleScoringParams = {
  totalCouples: number;
  method: GrandFinaleMethod;
  distancePenalty: number | null;
  tierSize: number | null;
  tierPayStyle: TierPayStyle;
  pointsPerCorrect: number;
  slotWeeks: SlotWeeks;
};

// Distance scoring counts weeks, not spots (Kylie, 2026-11-10): a couple
// predicted for the week they went home is exact, a double elimination is
// one week, and a week without an elimination still counts. The Finale is
// one week too, split evenly between its places (Kylie, 2026-11-11): with
// five couples in it a place off is a fifth of a week, so a couple that made
// the Finale always pays more than one that went home the week before.
// `weeks` is what the penalty multiplies; `off` is in `unit` for copy.
export function grandFinaleDistance(
  predictedPosition: number,
  actual: { start: number; end: number },
  { weekOf, finaleWeek, finaleSpots }: SlotWeeks
): { off: number; unit: "week" | "place"; weeks: number } {
  const predictedWeek = weekOf(predictedPosition);
  const firstWeek = weekOf(actual.start);
  const lastWeek = weekOf(actual.end);
  if (predictedWeek === finaleWeek && firstWeek === finaleWeek) {
    const off = Math.max(actual.start - predictedPosition, predictedPosition - actual.end, 0);
    return { off, unit: "place", weeks: off / finaleSpots };
  }
  const off = Math.max(firstWeek - predictedWeek, predictedWeek - lastWeek, 0);
  return { off, unit: "week", weeks: off };
}

function grandFinalePointsAt(
  predictedPosition: number,
  actualPosition: number,
  { totalCouples, method, distancePenalty, tierSize, tierPayStyle, pointsPerCorrect, slotWeeks }: GrandFinaleScoringParams
): number {
  if (method === "exact_position") {
    return predictedPosition === actualPosition ? pointsPerCorrect : 0;
  }
  if (method === "distance_based") {
    const { weeks } = grandFinaleDistance(predictedPosition, { start: actualPosition, end: actualPosition }, slotWeeks);
    return Math.max(0, pointsPerCorrect - weeks * (distancePenalty ?? 0));
  }
  const width = tierSize ?? 1;
  const actualBand = bandOf(actualPosition, totalCouples, width);
  return bandOf(predictedPosition, totalCouples, width) === actualBand
    ? pointsPerCorrect * bandPayoutFraction(actualBand, tierPayStyle)
    : 0;
}

// Positions run 1 = first eliminated .. totalCouples = winner. Couples
// eliminated the same week share the range of positions that week occupied
// (a double elimination is 2 positions wide), so a week with no elimination
// takes none and a double doesn't shift every later couple by one. Podium
// couples get their fixed top spots. Pass spoiler-clamped statuses and only
// revealed outcomes resolve.
export function eliminationPositionRanges(
  couples: { id: string; status: string; elimination_week: number | null }[]
): Map<string, { start: number; end: number }> {
  const total = couples.length;
  const ranges = new Map<string, { start: number; end: number }>();
  const outByWeek = new Map<number, string[]>();
  for (const c of couples) {
    if ((c.status === "eliminated" || c.status === "withdrawn") && c.elimination_week !== null) {
      outByWeek.set(c.elimination_week, [...(outByWeek.get(c.elimination_week) ?? []), c.id]);
    } else if (c.status === "winner") ranges.set(c.id, { start: total, end: total });
    else if (c.status === "runner_up") ranges.set(c.id, { start: total - 1, end: total - 1 });
    else if (c.status === "third_place") ranges.set(c.id, { start: total - 2, end: total - 2 });
  }
  let before = 0;
  for (const week of [...outByWeek.keys()].sort((a, b) => a - b)) {
    const ids = outByWeek.get(week)!;
    for (const id of ids) ranges.set(id, { start: before + 1, end: before + ids.length });
    before += ids.length;
  }
  return ranges;
}

// Dance Card finish (1 = winner) from a couple's position range. Couples
// out in the same week can't be told apart, so each takes the best
// placement in the shared range — matching Grand Finale's best-of-range.
export function finalPlacementFromRange(range: { start: number; end: number }, totalCouples: number): number {
  return totalCouples - range.end + 1;
}

// One couple's Grand Finale payout once its actual position is known —
// shared by the scoring engine and the Picks card. When the couple went out
// in a multi-couple week the order within that week is unknowable, so the
// prediction is credited against whichever of those positions suits it best.
export function grandFinalePredictionPoints({
  predictedPosition,
  actualPosition,
  actualPositionEnd = actualPosition,
  ...params
}: GrandFinaleScoringParams & {
  predictedPosition: number;
  actualPosition: number;
  actualPositionEnd?: number;
}): number {
  let best = 0;
  for (let position = actualPosition; position <= actualPositionEnd; position++) {
    best = Math.max(best, grandFinalePointsAt(predictedPosition, position, params));
  }
  return best;
}

// The most a couple still in the running can pay: it can only finish at or
// after the next open position, so a prediction for a slot that has already
// passed can no longer be exact. An upper bound — a double elimination or a
// no-elimination week changes who lands where, never the best case.
export function grandFinaleBestCasePoints({
  predictedPosition,
  firstOpenPosition,
  ...params
}: GrandFinaleScoringParams & { predictedPosition: number; firstOpenPosition: number }): number {
  let best = 0;
  for (let position = Math.min(firstOpenPosition, params.totalCouples); position <= params.totalCouples; position++) {
    best = Math.max(best, grandFinalePointsAt(predictedPosition, position, params));
  }
  return best;
}

// Pure and DB-free, same design as computeWeeklyScores — the caller resolves
// which couples newly became known this call (see buildPublicationPlan) and
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
  slotWeeks,
}: {
  predictions: GrandFinalePrediction[];
  resolvedCouples: ResolvedCouple[];
  totalCouples: number;
  method: GrandFinaleMethod;
  distancePenalty: number | null;
  tierSize: number | null;
  tierPayStyle: TierPayStyle;
  pointsPerCorrect: number;
  slotWeeks: SlotWeeks;
}): Record<string, number> {
  const resolvedByCouple = new Map(resolvedCouples.map((r) => [r.coupleId, r]));

  const pointsByManager: Record<string, number> = {};

  for (const p of predictions) {
    const resolved = resolvedByCouple.get(p.coupleId);
    if (!resolved) continue;

    const points = grandFinalePredictionPoints({
      predictedPosition: p.predictedPosition,
      actualPosition: resolved.actualPosition,
      actualPositionEnd: resolved.actualPositionEnd,
      totalCouples,
      method,
      distancePenalty,
      tierSize,
      tierPayStyle,
      pointsPerCorrect,
      slotWeeks,
    });

    pointsByManager[p.managerId] = (pointsByManager[p.managerId] ?? 0) + points;
  }

  for (const managerId in pointsByManager) {
    pointsByManager[managerId] = roundPoints(pointsByManager[managerId]);
  }

  return pointsByManager;
}
