import { describe, expect, it } from "vitest";
import {
  bandOf,
  bandPayoutFraction,
  classifyEliminationGuess,
  classifyTopScorerGuess,
  collapseToNights,
  computeGrandFinalePoints,
  eliminationPositionRanges,
  finalPlacementFromRange,
  grandFinaleBestCasePoints,
  grandFinaleDistance,
  grandFinalePredictionPoints,
  slotWeeks,
  computeWeeklyScores,
  curtainCallNearMiss2Points,
  curtainCallNearMissPoints,
  curtainCallPayout,
  curtainCallPreviewCopy,
  judgeCountForDance,
  nightScaledScoresByCouple,
  podiumPlaceByCouple,
  podiumPreviewCopy,
  podiumRuleNote,
  resolveCurtainCallGuess,
  resolvePodiumGuess,
  scaledJudgesScore,
  sumDanceScoresByCouple,
  type DanceScore,
  type ScoringSettings,
} from "./scoring";

// Every spot its own week, as Grand Finale scored before it counted weeks.
const perSpot = slotWeeks([], { finaleWeek: 100, completedThroughWeek: 0 });

const settings: ScoringSettings = {
  judgesScoreMultiplier: 1,
  survivalPoints: 10,
  eliminationPredictionPoints: 20,
  topScorerPredictionPoints: 15,
  firstPlacePoints: 100,
  secondPlacePoints: 50,
  thirdPlacePoints: 25,
  fourthPlacePoints: 12,
  fifthPlacePoints: 6,
  curtainCallNearMissEnabled: true,
};

// Most tests below aren't exercising Curtain Call's couples-remaining
// scaling, so couplesRemaining === totalCouples keeps curtainCallPayout a
// no-op (ratio 1) and existing point-value assertions unaffected. See the
// dedicated "couples-remaining scaling" describe block for that behavior.
const noScaling = { couplesRemaining: 10, totalCouples: 10 };

describe("computeWeeklyScores", () => {
  it("scores a single-dance week: roster points + survival, no points for the eliminated couple's owner", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [
        { managerId: "alice", coupleId: "couple-1" },
        { managerId: "bob", coupleId: "couple-2" },
      ],
      danceScores: [
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 24, scaledScore: 24, maxScore: null },
        { episodeId: "ep1", coupleId: "couple-2", totalScore: 18, scaledScore: 18, maxScore: null },
      ],
      episodeOutcomes: [
        { coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null },
        { coupleId: "couple-2", outcome: "eliminated", bonusPoints: 0, finalPlacement: null },
      ],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;

    expect(alice.rosterPoints).toBe(24 + 10); // dance score + survival
    expect(bob.rosterPoints).toBe(18); // eliminated: dance score only, no survival
  });

  // Previously this test locked in double pay (24 + 27 + 10): a second dance
  // on the same night counted as a second night. Dance Card now pays a night
  // once, on every mark received over every mark possible.
  it("pays a two-dance night once, on the combined marks, not once per dance", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 24, scaledScore: 24, maxScore: null },
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 27, scaledScore: 27, maxScore: null },
      ],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe((24 + 27) / 60 * 30 + 10); // 25.5 + survival
  });

  it("a judges'-save override (bottom two but saved) still counts as survived, not eliminated", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 20, scaledScore: 20, maxScore: null }],
      // saved_by_judges is a historical flag the DB stores, but the scoring
      // function only looks at the final `outcome` — this couple was saved
      // by judges, so outcome is "safe".
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [
        { managerId: "bob", predictedEliminatedCoupleId: "couple-1", predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: null },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;

    expect(alice.rosterPoints).toBe(20 + 10); // survived despite bottom-two
    expect(bob.predictionPoints).toBe(0); // predicted elimination was wrong
  });

  it("awards the Dance Card placement bonus for 1st/2nd/3rd", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [
        { managerId: "alice", coupleId: "winner-couple" },
        { managerId: "bob", coupleId: "runner-up-couple" },
        { managerId: "carol", coupleId: "third-couple" },
      ],
      danceScores: [
        { episodeId: "ep1", coupleId: "winner-couple", totalScore: 30, scaledScore: 30, maxScore: null },
        { episodeId: "ep1", coupleId: "runner-up-couple", totalScore: 29, scaledScore: 29, maxScore: null },
        { episodeId: "ep1", coupleId: "third-couple", totalScore: 28, scaledScore: 28, maxScore: null },
      ],
      episodeOutcomes: [
        { coupleId: "winner-couple", outcome: "winner", bonusPoints: 0, finalPlacement: 1 },
        { coupleId: "runner-up-couple", outcome: "runner_up", bonusPoints: 0, finalPlacement: 2 },
        { coupleId: "third-couple", outcome: "third_place", bonusPoints: 0, finalPlacement: 3 },
      ],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;
    const carol = result.find((r) => r.managerId === "carol")!;

    expect(alice.rosterPoints).toBe(30 + 10 + 100); // dance + survival + Dance Card 1st
    expect(alice.grandFinalePoints).toBe(0); // Grand Finale has no placement bonus
    expect(bob.rosterPoints).toBe(29 + 10 + 50); // dance + survival + Dance Card 2nd
    expect(bob.grandFinalePoints).toBe(0);
    expect(carol.rosterPoints).toBe(28 + 10 + 25); // dance + survival + Dance Card 3rd
    expect(carol.grandFinalePoints).toBe(0);
  });

  it("awards the Dance Card placement bonus for 4th/5th place too, extending past the podium", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [
        { managerId: "alice", coupleId: "fourth-couple" },
        { managerId: "bob", coupleId: "fifth-couple" },
      ],
      danceScores: [],
      episodeOutcomes: [
        { coupleId: "fourth-couple", outcome: "eliminated", bonusPoints: 0, finalPlacement: 4 },
        { coupleId: "fifth-couple", outcome: "eliminated", bonusPoints: 0, finalPlacement: 5 },
      ],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;

    expect(alice.rosterPoints).toBe(12); // eliminated: no survival, just Dance Card 4th
    expect(alice.grandFinalePoints).toBe(0);
    expect(bob.rosterPoints).toBe(6); // Dance Card 5th
    expect(bob.grandFinalePoints).toBe(0);
  });

  it("does not award a placement bonus when finalPlacement is omitted, even for a 'winner' outcome", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 30, scaledScore: 30, maxScore: null }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "winner", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe(30 + 10);
    expect(result[0].grandFinalePoints).toBe(0);
  });

  it("ignores a finalPlacement outside 1-5 (defensive bound)", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 10, scaledScore: 10, maxScore: null }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "eliminated", bonusPoints: 0, finalPlacement: 6 }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe(10); // no placement bonus, just dance score
    expect(result[0].grandFinalePoints).toBe(0);
  });

  it("a withdrawal earns no survival points and doesn't resolve an Eliminated prediction as correct", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "withdrawn", bonusPoints: 0, finalPlacement: null }],
      predictions: [
        { managerId: "bob", predictedEliminatedCoupleId: "couple-1", predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: null },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;

    expect(alice.rosterPoints).toBe(0); // no dance, no survival bonus
    expect(bob.predictionPoints).toBe(0); // withdrawal isn't a resolved "Eliminated" guess
  });

  it("a bye week earns no survival points but isn't a wrong Eliminated guess either", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "bye", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe(0);
  });

  it("adds bonus points directly to that couple's roster points, independent of survival/podium", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 20, scaledScore: 20, maxScore: null }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 3, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe(20 + 10 + 3); // dance + survival + dance-off bonus
  });

  it("awards top-scorer prediction points independent of roster ownership", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 24, scaledScore: 24, maxScore: null },
        { episodeId: "ep1", coupleId: "couple-2", totalScore: 27, scaledScore: 27, maxScore: null },
      ],
      episodeOutcomes: [
        { coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null },
        { coupleId: "couple-2", outcome: "safe", bonusPoints: 0, finalPlacement: null },
      ],
      predictions: [
        { managerId: "alice", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "couple-2" },
        { managerId: "bob", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "couple-1" },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    const bob = result.find((r) => r.managerId === "bob")!;

    expect(alice.predictionPoints).toBe(15);
    expect(bob.predictionPoints).toBe(0);
  });

  it("applies category weights to totalPoints, leaving the raw per-category points unweighted", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 20, scaledScore: 20, maxScore: null }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [
        { managerId: "alice", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "couple-1" },
      ],
      isDoubleElimination: false,
      ...noScaling,
      categoryWeights: { judges: 2, eliminations: 0.5, bonus: 1 },
      grandFinalePointsByManager: { alice: 10 },
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    expect(alice.rosterPoints).toBe(30); // 20 dance + 10 survival, unweighted
    expect(alice.predictionPoints).toBe(15); // unweighted
    expect(alice.grandFinalePoints).toBe(10); // unweighted
    expect(alice.totalPoints).toBe(77.5); // 30*2 + 15*0.5 + 10*1, kept to two decimals
  });

  it("defaults totalPoints to a flat sum when no weights/grand-finale points are passed", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ episodeId: "ep1", coupleId: "couple-1", totalScore: 20, scaledScore: 20, maxScore: null }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].totalPoints).toBe(30);
    expect(result[0].grandFinalePoints).toBe(0);
  });
});

describe("Dance Card per-night scaling", () => {
  const disney = { ...settings, judgesScoreMultiplier: 0.2449, survivalPoints: 0 };
  const rosterPointsFor = (danceScores: DanceScore[], scoringSettings = disney) =>
    computeWeeklyScores({
      scoringSettings,
      rosterSlots: [{ managerId: "alice", coupleId: "amber" }],
      danceScores,
      episodeOutcomes: [{ coupleId: "amber", outcome: "eliminated", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    })[0].rosterPoints;
  // Four judges: a 36/40 dance is stored as scaled 27.
  const dance36of40 = { episodeId: "ep1", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: null };

  it("pays 1, 2 and 3 dances at 36/40 the same, since each night is 90% of its max", () => {
    const one = rosterPointsFor([dance36of40]);
    const two = rosterPointsFor([dance36of40, dance36of40]);
    const three = rosterPointsFor([dance36of40, dance36of40, dance36of40]);
    expect(one).toBe(6.61); // 27 × 0.2449 = 6.6123
    expect(two).toBe(one);
    expect(three).toBe(one);
  });

  it("keeps a one-dance night numerically identical to the stored scaled score", () => {
    // 25.1 is not what 3 × total / judges would give for any whole panel; the
    // stored value must pass through untouched rather than be re-derived.
    const [night] = collapseToNights([{ episodeId: "ep1", coupleId: "amber", totalScore: 26, scaledScore: 25.1, maxScore: null }]);
    expect(night.scaledScore).toBe(25.1);
    expect(night.totalScore).toBe(26);
    expect(rosterPointsFor([{ episodeId: "ep1", coupleId: "amber", totalScore: 38, scaledScore: 28.5, maxScore: null }], settings)).toBe(28.5);
  });

  it("scores Disney Night's individual plus team dance as one 64/80 night", () => {
    const [night] = collapseToNights([
      { episodeId: "ep1", coupleId: "amber", totalScore: 28, scaledScore: 21, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: null },
    ]);
    expect(night).toEqual({ episodeId: "ep1", coupleId: "amber", totalScore: 64, scaledScore: 24, maxScore: 80, bonusScore: 0, danceCount: 2 });
    // Multiplier applied to the unrounded night, rounded once at the end.
    expect(rosterPointsFor([
      { episodeId: "ep1", coupleId: "amber", totalScore: 28, scaledScore: 21, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: null },
    ])).toBe(5.88); // 24 × 0.2449 = 5.8776, previously 11.76
  });

  it("weights a mixed three-judge and four-judge night by each dance's own max", () => {
    const [night] = collapseToNights([
      { episodeId: "ep1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 40, scaledScore: 30, maxScore: null },
    ]);
    expect(night.maxScore).toBe(70);
    expect(night.scaledScore).toBeCloseTo((64 / 70) * 30, 10); // 27.428…, not (24 + 30) / 2
    expect(rosterPointsFor([
      { episodeId: "ep1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 40, scaledScore: 30, maxScore: null },
    ], { ...settings, survivalPoints: 0 })).toBe(27.43);
  });

  it("keeps two episodes in one week separate: each night pays once, then the nights add up", () => {
    const nights = collapseToNights([
      { episodeId: "night-1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "night-2", coupleId: "amber", totalScore: 27, scaledScore: 27, maxScore: null },
    ]);
    expect(nights).toHaveLength(2);
    expect(nightScaledScoresByCouple([
      { episodeId: "night-1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "night-2", coupleId: "amber", totalScore: 27, scaledScore: 27, maxScore: null },
    ]).get("amber")).toBe(51); // not (24 + 27) / 60 × 30 = 25.5
    expect(rosterPointsFor([
      { episodeId: "night-1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "night-2", coupleId: "amber", totalScore: 27, scaledScore: 27, maxScore: null },
    ], { ...settings, survivalPoints: 0 })).toBe(51);
  });

  it("recovers the panel size from a stored row, including half points", () => {
    expect(judgeCountForDance({ totalScore: 26, scaledScore: 26 })).toBe(3);
    expect(judgeCountForDance({ totalScore: 37, scaledScore: 27.75 })).toBe(4);
    expect(judgeCountForDance({ totalScore: 44, scaledScore: 26.4 })).toBe(5);
    expect(judgeCountForDance({ totalScore: 18, scaledScore: 27 })).toBe(2);
    expect(judgeCountForDance({ totalScore: 28.5, scaledScore: 28.5 })).toBe(3);
    expect(judgeCountForDance({ totalScore: 0, scaledScore: 0 })).toBeNull();
  });

  it("gives a 0-mark dance the panel the rest of that night used", () => {
    const [night] = collapseToNights([
      { episodeId: "ep1", coupleId: "amber", totalScore: 0, scaledScore: 0, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: null },
      { episodeId: "ep1", coupleId: "other", totalScore: 32, scaledScore: 24, maxScore: null },
    ]);
    expect(night.maxScore).toBe(80);
    expect(night.scaledScore).toBe(13.5); // 36/80 × 30
    const [alone] = collapseToNights([{ episodeId: "ep1", coupleId: "amber", totalScore: 0, scaledScore: 0, maxScore: null }]);
    expect(alone).toMatchObject({ scaledScore: 0, maxScore: 30 });
  });

  it("does not round the night before the multiplier", () => {
    // 64/70 × 30 = 27.428571…; × 7 is exactly 192. Rounding the night to
    // 27.43 first would pay 192.01.
    expect(rosterPointsFor([
      { episodeId: "ep1", coupleId: "amber", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 40, scaledScore: 30, maxScore: null },
    ], { ...settings, survivalPoints: 0, judgesScoreMultiplier: 7 })).toBe(192);
  });

  it("keeps the top scorer and near-miss bands on the combined raw night total", () => {
    const danceScores: DanceScore[] = [
      // Amber: best single dance of the night (36) but 64 combined.
      { episodeId: "ep1", coupleId: "amber", totalScore: 28, scaledScore: 21, maxScore: null },
      { episodeId: "ep1", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: null },
      // Julia: 65 combined, no single dance above 33.
      { episodeId: "ep1", coupleId: "julia", totalScore: 33, scaledScore: 24.75, maxScore: null },
      { episodeId: "ep1", coupleId: "julia", totalScore: 32, scaledScore: 24, maxScore: null },
      // Tatyana: 63 combined, within 2 of the high.
      { episodeId: "ep1", coupleId: "tatyana", totalScore: 30, scaledScore: 22.5, maxScore: null },
      { episodeId: "ep1", coupleId: "tatyana", totalScore: 33, scaledScore: 24.75, maxScore: null },
    ];
    const totals = sumDanceScoresByCouple(danceScores);
    expect(totals.get("amber")).toBe(64);
    expect(classifyTopScorerGuess("julia", totals)).toBe("exact");
    expect(classifyTopScorerGuess("amber", totals)).toBe("near_miss");
    expect(classifyTopScorerGuess("tatyana", totals)).toBe("near_miss_2");

    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores,
      episodeOutcomes: [],
      predictions: [
        { managerId: "alice", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "julia" },
        { managerId: "bob", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "amber" },
        { managerId: "carol", predictedEliminatedCoupleId: null, predictedEliminatedCoupleId2: null, predictedTopScorerCoupleId: "tatyana" },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });
    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(15);
    expect(result.find((r) => r.managerId === "bob")!.predictionPoints).toBe(3.75);
    expect(result.find((r) => r.managerId === "carol")!.predictionPoints).toBe(1.5);
  });
});

describe("Dance Card with special dances", () => {
  const flat = { ...settings, judgesScoreMultiplier: 1, survivalPoints: 0 };
  const rosterPointsFor = (danceScores: DanceScore[], coupleId = "amber") =>
    computeWeeklyScores({
      scoringSettings: flat,
      rosterSlots: [{ managerId: "alice", coupleId }],
      danceScores,
      episodeOutcomes: [{ coupleId, outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    })[0].rosterPoints;
  const own = (totalScore: number, scaledScore: number, coupleId = "amber") => ({ episodeId: "ep1", coupleId, totalScore, scaledScore, maxScore: null });
  const special = (totalScore: number, maxScore: number, coupleId = "amber") => ({
    episodeId: "ep1",
    coupleId,
    totalScore,
    scaledScore: maxScore > 0 ? (totalScore * 30) / maxScore : 0,
    maxScore,
  });
  const bonus = (points: number, coupleId = "amber") => special(points, 0, coupleId);

  it("adds a bonus round's points to the night total but not to the max, so Dance Card can pass 30", () => {
    const [night] = collapseToNights([own(28, 28), bonus(3)]);
    expect(night).toMatchObject({ totalScore: 31, bonusScore: 3, maxScore: 30, scaledScore: 31 });
    expect(rosterPointsFor([own(30, 30), bonus(3)])).toBe(33);
    expect(rosterPointsFor([own(34, 25.5), special(36, 40), bonus(3)])).toBe(27.38); // 73/80 × 30
  });

  it("subtracts a penalty the same way", () => {
    expect(rosterPointsFor([own(28, 28), bonus(-1.5)])).toBe(26.5);
  });

  it("pays a couple whose only row is a bonus round against one standard dance on the night's panel", () => {
    const [alone] = collapseToNights([bonus(3)]);
    expect(alone).toMatchObject({ totalScore: 3, bonusScore: 3, maxScore: 30, scaledScore: 3 });
    const night = collapseToNights([bonus(3), own(36, 27, "other"), own(32, 24, "another")]);
    expect(night.find((n) => n.coupleId === "amber")).toMatchObject({ maxScore: 40, scaledScore: 2.25 }); // 3/40 × 30
    expect(rosterPointsFor([bonus(3), own(36, 27, "other")])).toBe(2.25);
    expect(rosterPointsFor([bonus(0)])).toBe(0);
  });

  it("counts bonus points toward the weekly top scorer and its bands", () => {
    const danceScores: DanceScore[] = [
      own(36, 27, "amber"),
      own(35, 26.25, "julia"),
      bonus(3, "julia"),
      own(37, 27.75, "tatyana"),
    ];
    const totals = sumDanceScoresByCouple(danceScores);
    expect(totals.get("julia")).toBe(38);
    expect(classifyTopScorerGuess("julia", totals)).toBe("exact");
    expect(classifyTopScorerGuess("tatyana", totals)).toBe("near_miss");
    expect(classifyTopScorerGuess("amber", totals)).toBe("near_miss_2");
  });

  it("pays a special dance scored on its own per-judge max against that max", () => {
    expect(scaledJudgesScore([8, 7.5, 8], 8)).toBe(29.375);
    expect(scaledJudgesScore([5, 5], 5)).toBe(30);
    expect(scaledJudgesScore([1, 0.5], 1)).toBe(22.5);
    const [night] = collapseToNights([own(24, 24), special(23.5, 24)]);
    expect(night).toMatchObject({ totalScore: 47.5, maxScore: 54, bonusScore: 0 });
    expect(night.scaledScore).toBeCloseTo((47.5 / 54) * 30, 10);
    expect(rosterPointsFor([own(24, 24), special(23.5, 24)])).toBe(26.39);
  });

  it("holds every per-judge max from 1 to 10 in half steps to the same 30-point basis for a perfect dance", () => {
    for (let max = 1; max <= 10; max += 0.5) {
      expect(scaledJudgesScore([max, max, max], max)).toBe(30);
      expect(scaledJudgesScore([max, max], max)).toBe(30);
      expect(scaledJudgesScore([max, max, max, max], max)).toBe(30);
      expect(scaledJudgesScore([max / 2, max / 2, max / 2], max)).toBe(15);
    }
  });

  it("pays a two-, three-, or four-judge special dance on the same 30-point basis", () => {
    expect(scaledJudgesScore([9, 9], 10)).toBe(27);
    expect(scaledJudgesScore([9, 9, 9], 10)).toBe(27);
    expect(scaledJudgesScore([9, 9, 9, 9], 10)).toBe(27);
    expect(rosterPointsFor([own(27, 27), special(18, 20)])).toBe(27); // 45/50 × 30
    expect(rosterPointsFor([own(27, 27), special(27, 30)])).toBe(27);
    expect(rosterPointsFor([own(27, 27), special(36, 40)])).toBe(27);
  });

  it("recovers the night's panel from an out-of-10 special dance for a legacy 0-mark row", () => {
    const [night] = collapseToNights([own(0, 0), special(36, 40)]);
    expect(night.maxScore).toBe(80);
    const [mixed] = collapseToNights([own(0, 0), special(23.5, 24)]);
    expect(mixed.maxScore).toBe(54); // 24 says nothing about the panel; the standing three stands in
  });

  it("keeps a lone legacy row on its stored scale but recomputes a lone special row from its max", () => {
    const [legacy] = collapseToNights([own(26, 25.1)]);
    expect(legacy.scaledScore).toBe(25.1);
    const [specialOnly] = collapseToNights([{ ...special(30, 32), scaledScore: 1 }]);
    expect(specialOnly.scaledScore).toBe(28.125);
  });
});

describe("scaledJudgesScore", () => {
  it("leaves a standing three-judge panel's total alone", () => {
    expect(scaledJudgesScore([8, 9, 9])).toBe(26);
  });

  it("puts a four-judge guest night on the 30-point basis", () => {
    expect(scaledJudgesScore([10, 9, 9, 9])).toBe(27.75);
  });

  it("scales a night a judge missed up, not down", () => {
    expect(scaledJudgesScore([9, 9])).toBe(27);
  });

  it("is 0 before any judge has scored, and on a max of 0", () => {
    expect(scaledJudgesScore([])).toBe(0);
    expect(scaledJudgesScore([3], 0)).toBe(0);
  });
});

describe("computeWeeklyScores — guest-judge night", () => {
  it("pays roster points on the scaled score but picks the top scorer on the TV total", () => {
    const [alice] = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 38, scaledScore: 28.5, maxScore: null },
        { episodeId: "ep1", coupleId: "couple-2", totalScore: 37, scaledScore: 27.75, maxScore: null },
      ],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: null,
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "couple-1",
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });
    expect(alice.rosterPoints).toBe(28.5 + settings.survivalPoints);
    expect(alice.predictionPoints).toBe(settings.topScorerPredictionPoints);
  });
});

describe("curtainCallPayout", () => {
  it("returns the base value unchanged when couplesRemaining equals totalCouples", () => {
    expect(curtainCallPayout(30, 10, 10)).toBe(30);
  });

  it("scales down proportionally as fewer couples remain", () => {
    expect(curtainCallPayout(30, 5, 10)).toBe(15);
    expect(curtainCallPayout(30, 2, 10)).toBe(6);
  });

  it("falls back to the base value when totalCouples is 0 (guards divide-by-zero)", () => {
    expect(curtainCallPayout(30, 0, 0)).toBe(30);
  });
});

describe("computeWeeklyScores — couples-remaining scaling", () => {
  it("scales both Curtain Call sub-mechanics by the same couples-remaining ratio", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [
        { episodeId: "ep1", coupleId: "couple-1", totalScore: 24, scaledScore: 24, maxScore: null },
        { episodeId: "ep1", coupleId: "couple-2", totalScore: 27, scaledScore: 27, maxScore: null },
      ],
      episodeOutcomes: [
        { coupleId: "couple-1", outcome: "eliminated", bonusPoints: 0, finalPlacement: null },
        { coupleId: "couple-2", outcome: "safe", bonusPoints: 0, finalPlacement: null },
      ],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-1",
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "couple-2",
        },
      ],
      isDoubleElimination: false,
      couplesRemaining: 4,
      totalCouples: 8,
    });

    const alice = result.find((r) => r.managerId === "alice")!;
    // eliminationPredictionPoints=20 at ratio 0.5 is 10; topScorerPredictionPoints=15
    // at ratio 0.5 is 7.5; the two-decimal sum is 17.5.
    expect(alice.predictionPoints).toBe(17.5);
  });

  it("scales both double-elimination guesses by the same ratio", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes: [
        { coupleId: "couple-1", outcome: "eliminated", bonusPoints: 0, finalPlacement: null },
        { coupleId: "couple-2", outcome: "eliminated", bonusPoints: 0, finalPlacement: null },
      ],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-1",
          predictedEliminatedCoupleId2: "couple-2",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      couplesRemaining: 6,
      totalCouples: 12,
    });

    // eliminationPredictionPoints=20 at ratio 0.5, awarded twice (both guesses correct)
    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(2 * (20 * 0.5));
  });
});

describe("computeWeeklyScores — double elimination", () => {
  const episodeOutcomes = [
    { coupleId: "couple-1", outcome: "eliminated" as const, bonusPoints: 0, finalPlacement: null },
    { coupleId: "couple-2", outcome: "eliminated" as const, bonusPoints: 0, finalPlacement: null },
    { coupleId: "couple-3", outcome: "safe" as const, bonusPoints: 0, finalPlacement: null },
  ];

  it("awards zero prediction points when neither guess is correct", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-3",
          predictedEliminatedCoupleId2: "couple-3",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(0);
  });

  it("awards one guess's worth of points when only the first slot is correct", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-1",
          predictedEliminatedCoupleId2: "couple-3",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(20);
  });

  it("awards one guess's worth of points when only the second slot is correct", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-3",
          predictedEliminatedCoupleId2: "couple-2",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(20);
  });

  it("awards double points (one per guess) when both guesses are correct", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-1",
          predictedEliminatedCoupleId2: "couple-2",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(40);
  });

  it("ignores a populated second slot entirely when isDoubleElimination is false (normal week unaffected)", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "couple-1",
          // Stray/unexpected data on a normal week -- should never happen in
          // practice (the RPC rejects it), but the pure function must still
          // ignore it defensively rather than accidentally double-score.
          predictedEliminatedCoupleId2: "couple-2",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(20);
  });
});

describe("Curtain Call In Jeopardy", () => {
  const safe = (coupleId: string) => ({
    coupleId,
    outcome: "safe" as const,
    bonusPoints: 0,
    finalPlacement: null,
  });
  const eliminated = (coupleId: string) => ({
    coupleId,
    outcome: "eliminated" as const,
    bonusPoints: 0,
    finalPlacement: null,
  });

  it("takes 25% of the unrounded exact payout, to two decimals", () => {
    expect(curtainCallNearMissPoints(20)).toBe(5);
    expect(curtainCallNearMissPoints(15)).toBe(3.75);
    expect(curtainCallNearMissPoints(10)).toBe(2.5);
    // 31 * 5/10 = 15.5; 15.5 * 0.25 = 3.875 → 3.88.
    expect(curtainCallNearMissPoints(curtainCallPayout(31, 5, 10))).toBe(3.88);
    expect(curtainCallNearMissPoints(1)).toBe(0.25);
  });

  it("pays a quarter when the elim guess was marked In Jeopardy", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes: [eliminated("gone"), safe("called-down"), safe("other")],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "called-down",
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
      inJeopardyCoupleIds: ["called-down"],
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(5);
  });

  it("lets exact beat In Jeopardy when the guess is both eliminated and marked", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes: [eliminated("gone")],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "gone",
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
      inJeopardyCoupleIds: ["gone"],
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(20);
    expect(classifyEliminationGuess("gone", new Set(["gone"]), new Set(["gone"]))).toBe("exact");
  });

  it("scores each double-elim In Jeopardy guess on its own", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes: [eliminated("gone-1"), eliminated("gone-2"), safe("jeopardy-a"), safe("jeopardy-b")],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "jeopardy-a",
          predictedEliminatedCoupleId2: "jeopardy-b",
          predictedTopScorerCoupleId: null,
        },
      ],
      isDoubleElimination: true,
      ...noScaling,
      inJeopardyCoupleIds: ["jeopardy-a", "jeopardy-b"],
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(5 + 5);
  });

  it("pays a top scorer within 1 of the high, 10% within 2, nothing farther out", () => {
    const totals = sumDanceScoresByCouple([
      { coupleId: "high", totalScore: 30 },
      { coupleId: "within", totalScore: 29 },
      { coupleId: "third", totalScore: 28 },
      { coupleId: "fourth", totalScore: 20 },
    ]);
    expect(classifyTopScorerGuess("high", totals)).toBe("exact");
    expect(classifyTopScorerGuess("within", totals)).toBe("near_miss");
    expect(classifyTopScorerGuess("third", totals)).toBe("near_miss_2");
    expect(classifyTopScorerGuess("fourth", totals)).toBe("miss");

    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [],
      danceScores: [
        { episodeId: "ep1", coupleId: "high", totalScore: 30, scaledScore: 30, maxScore: null },
        { episodeId: "ep1", coupleId: "within", totalScore: 29, scaledScore: 29, maxScore: null },
        { episodeId: "ep1", coupleId: "third", totalScore: 28, scaledScore: 28, maxScore: null },
      ],
      episodeOutcomes: [safe("high"), safe("within"), safe("third")],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: null,
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "within",
        },
        {
          managerId: "bob",
          predictedEliminatedCoupleId: null,
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "third",
        },
        {
          managerId: "carol",
          predictedEliminatedCoupleId: null,
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "high",
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(3.75);
    expect(result.find((r) => r.managerId === "bob")!.predictionPoints).toBe(1.5);
    expect(result.find((r) => r.managerId === "carol")!.predictionPoints).toBe(15);
  });

  it("treats a tie at the high as exact only, with one band per point below", () => {
    const totals = sumDanceScoresByCouple([
      { coupleId: "a", totalScore: 27 },
      { coupleId: "b", totalScore: 27 },
      { coupleId: "c", totalScore: 26 },
      { coupleId: "d", totalScore: 25 },
      { coupleId: "e", totalScore: 24 },
    ]);
    expect(classifyTopScorerGuess("a", totals)).toBe("exact");
    expect(classifyTopScorerGuess("b", totals)).toBe("exact");
    expect(classifyTopScorerGuess("c", totals)).toBe("near_miss");
    expect(classifyTopScorerGuess("d", totals)).toBe("near_miss_2");
    expect(classifyTopScorerGuess("e", totals)).toBe("miss");
  });

  it("does not near-miss a top scorer who has no score row", () => {
    const totals = sumDanceScoresByCouple([{ coupleId: "high", totalScore: 30 }]);
    expect(classifyTopScorerGuess("bye", totals)).toBe("miss");
    expect(resolveCurtainCallGuess("near_miss", 15, false)).toEqual({ verdict: "miss", points: 0 });
    expect(resolveCurtainCallGuess("near_miss_2", 15, false)).toEqual({ verdict: "miss", points: 0 });
  });

  it("pays the within-2 band 10% of the exact payout, two-decimal rounded", () => {
    expect(resolveCurtainCallGuess("near_miss_2", 15, true)).toEqual({ verdict: "near_miss_2", points: 1.5 });
    expect(curtainCallNearMiss2Points(curtainCallPayout(31, 5, 10))).toBe(1.55);
  });

  it("pays nothing for a near-miss when the league has In Jeopardy off", () => {
    const result = computeWeeklyScores({
      scoringSettings: { ...settings, curtainCallNearMissEnabled: false },
      rosterSlots: [],
      danceScores: [
        { episodeId: "ep1", coupleId: "high", totalScore: 30, scaledScore: 30, maxScore: null },
        { episodeId: "ep1", coupleId: "within", totalScore: 29, scaledScore: 29, maxScore: null },
      ],
      episodeOutcomes: [eliminated("gone"), safe("called-down"), safe("high"), safe("within")],
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: "called-down",
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: "within",
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
      inJeopardyCoupleIds: ["called-down"],
    });

    expect(result.find((r) => r.managerId === "alice")!.predictionPoints).toBe(0);
  });

  it("previews two-decimal points, with the near-miss clause only when enabled", () => {
    expect(
      curtainCallPreviewCopy({
        kind: "elimination",
        exactDisplayPoints: 30,
        nearMissPoints: 7.5,
        nearMissEnabled: true,
      })
    ).toBe("Correct elimination: 30.00 pts · 7.50 pts if In Jeopardy");
    expect(
      curtainCallPreviewCopy({
        kind: "top_scorer",
        exactDisplayPoints: 20,
        nearMissPoints: 5,
        nearMiss2Points: 2,
        nearMissEnabled: true,
      })
    ).toBe("Correct top scorer: 20.00 pts · 5.00 pts within 1 of the high · 2.00 pts within 2");
    expect(
      curtainCallPreviewCopy({
        kind: "elimination",
        exactDisplayPoints: 30,
        nearMissPoints: 7.5,
        nearMissEnabled: false,
      })
    ).toBe("Correct elimination: 30.00 pts");
  });
});

describe("computeGrandFinalePoints", () => {
  const totalCouples = 6;

  it("exact_position: full points only on an exact match", () => {
    const points = computeGrandFinalePoints({
      predictions: [
        { managerId: "alice", coupleId: "couple-1", predictedPosition: 2 },
        { managerId: "bob", coupleId: "couple-1", predictedPosition: 3 },
      ],
      resolvedCouples: [{ coupleId: "couple-1", actualPosition: 2 }],
      totalCouples,
      method: "exact_position",
      distancePenalty: null,
      tierSize: null,
      tierPayStyle: "equal",
      pointsPerCorrect: 50,
      slotWeeks: perSpot,
    });

    expect(points.alice).toBe(50);
    expect(points.bob).toBe(0);
  });

  it("distance_based: docks points per position off, floored at 0", () => {
    const points = computeGrandFinalePoints({
      predictions: [
        { managerId: "alice", coupleId: "couple-1", predictedPosition: 2 },
        { managerId: "bob", coupleId: "couple-1", predictedPosition: 6 },
      ],
      resolvedCouples: [{ coupleId: "couple-1", actualPosition: 3 }],
      totalCouples,
      method: "distance_based",
      distancePenalty: 5,
      tierSize: null,
      tierPayStyle: "equal",
      pointsPerCorrect: 50,
      slotWeeks: perSpot,
    });

    expect(points.alice).toBe(45); // 1 position off: 50 - 1*5
    expect(points.bob).toBe(35); // 3 positions off: 50 - 3*5
  });

  it("band_tier: pays when predicted and actual land in the same band, at any depth", () => {
    // totalCouples=6, width 3 -> bands: positions 4-6 (band 0), 1-3 (band 1)
    const points = computeGrandFinalePoints({
      predictions: [
        { managerId: "alice", coupleId: "winner", predictedPosition: 5 }, // band 0, actual band 0
        { managerId: "alice", coupleId: "early-out", predictedPosition: 2 }, // band 1, actual band 1
        { managerId: "bob", coupleId: "early-out", predictedPosition: 5 }, // band 0, actual band 1
      ],
      resolvedCouples: [
        { coupleId: "winner", actualPosition: 6 },
        { coupleId: "early-out", actualPosition: 1 },
      ],
      totalCouples,
      method: "band_tier",
      distancePenalty: null,
      tierSize: 3,
      tierPayStyle: "equal",
      pointsPerCorrect: 50,
      slotWeeks: perSpot,
    });

    expect(points.alice).toBe(100); // both couples in the right band
    expect(points.bob).toBe(0);
  });

  it("band_tier graded: lower bands pay a decaying fraction", () => {
    const points = computeGrandFinalePoints({
      predictions: [
        { managerId: "alice", coupleId: "winner", predictedPosition: 6 },
        { managerId: "alice", coupleId: "early-out", predictedPosition: 1 },
      ],
      resolvedCouples: [
        { coupleId: "winner", actualPosition: 6 },
        { coupleId: "early-out", actualPosition: 1 },
      ],
      totalCouples,
      method: "band_tier",
      distancePenalty: null,
      tierSize: 3,
      tierPayStyle: "graded",
      pointsPerCorrect: 100,
      slotWeeks: perSpot,
    });

    expect(points.alice).toBe(175); // band 0 at 100% + band 1 at 75%
  });

  it("ignores predictions for couples not in the resolved batch", () => {
    const points = computeGrandFinalePoints({
      predictions: [{ managerId: "alice", coupleId: "still-active", predictedPosition: 1 }],
      resolvedCouples: [],
      totalCouples,
      method: "exact_position",
      distancePenalty: null,
      tierSize: null,
      tierPayStyle: "equal",
      pointsPerCorrect: 50,
      slotWeeks: perSpot,
    });

    expect(points).toEqual({});
  });
});

describe("bandOf / bandPayoutFraction", () => {
  it("counts bands down from the winner and leaves a smaller last band", () => {
    // 12 couples, width 5: 12-8 (band 0), 7-3 (band 1), 2-1 (band 2)
    expect(bandOf(12, 12, 5)).toBe(0);
    expect(bandOf(8, 12, 5)).toBe(0);
    expect(bandOf(7, 12, 5)).toBe(1);
    expect(bandOf(3, 12, 5)).toBe(1);
    expect(bandOf(2, 12, 5)).toBe(2);
    expect(bandOf(1, 12, 5)).toBe(2);
  });

  it("puts everyone in one band when the width covers the cast", () => {
    expect(bandOf(1, 12, 20)).toBe(0);
    expect(bandOf(12, 12, 20)).toBe(0);
  });

  it("treats width 1 as one band per spot", () => {
    expect(bandOf(11, 12, 1)).toBe(1);
  });

  it("graded pay steps down 25% per band and floors at 25%", () => {
    expect([0, 1, 2, 3, 4, 5].map((b) => bandPayoutFraction(b, "graded"))).toEqual([1, 0.75, 0.5, 0.25, 0.25, 0.25]);
    expect(bandPayoutFraction(4, "equal")).toBe(1);
  });
});

describe("eliminationPositionRanges", () => {
  const c = (id: string, status: string, week: number | null) => ({ id, status, elimination_week: week });

  it("gives a double-elimination week a shared range and starts later weeks after it", () => {
    const ranges = eliminationPositionRanges([
      c("a", "eliminated", 1),
      c("b", "eliminated", 1),
      c("c", "eliminated", 2),
      c("d", "active", null),
    ]);
    expect(ranges.get("a")).toEqual({ start: 1, end: 2 });
    expect(ranges.get("b")).toEqual({ start: 1, end: 2 });
    expect(ranges.get("c")).toEqual({ start: 3, end: 3 });
    expect(ranges.has("d")).toBe(false);
  });

  it("skips weeks with no elimination and puts the podium at the top", () => {
    const ranges = eliminationPositionRanges([
      c("a", "eliminated", 1),
      c("b", "eliminated", 4),
      c("w", "winner", null),
      c("r", "runner_up", null),
      c("t", "third_place", null),
    ]);
    expect(ranges.get("b")).toEqual({ start: 2, end: 2 });
    expect([ranges.get("w")?.start, ranges.get("r")?.start, ranges.get("t")?.start]).toEqual([5, 4, 3]);
  });
});

describe("finalPlacementFromRange", () => {
  it("maps a single position to its placement", () => {
    expect(finalPlacementFromRange({ start: 12, end: 12 }, 16)).toBe(5);
  });

  it("gives both couples of a top-five double the better placement", () => {
    // 16 couples, 4th and 5th place go out together at positions 12–13.
    expect(finalPlacementFromRange({ start: 12, end: 13 }, 16)).toBe(4);
  });

  it("lifts a semi-final double into the fifth-place bonus", () => {
    // Six left, two go home: positions 11–12 are 6th and 5th place.
    expect(finalPlacementFromRange({ start: 11, end: 12 }, 16)).toBe(5);
  });
});

describe("grandFinalePredictionPoints", () => {
  const params = {
    totalCouples: 16,
    method: "distance_based" as const,
    distancePenalty: 5,
    tierSize: null,
    tierPayStyle: "equal" as const,
    pointsPerCorrect: 20,
    slotWeeks: perSpot,
  };

  it("credits a prediction inside a multi-couple week's range as exact", () => {
    expect(grandFinalePredictionPoints({ ...params, predictedPosition: 2, actualPosition: 1, actualPositionEnd: 2 })).toBe(20);
  });

  it("measures from the nearest end of the range otherwise", () => {
    expect(grandFinalePredictionPoints({ ...params, predictedPosition: 4, actualPosition: 1, actualPositionEnd: 2 })).toBe(10);
  });
});

describe("Grand Finale distance in weeks", () => {
  // Week 1 sends one couple home, Week 2 none, Week 3 two; Week 4 is still to
  // come and Week 5 is the Finale, which holds every spot left (8 couples).
  const couples = [
    { status: "eliminated", elimination_week: 1 },
    { status: "eliminated", elimination_week: 3 },
    { status: "eliminated", elimination_week: 3 },
    ...Array.from({ length: 5 }, () => ({ status: "active", elimination_week: null })),
  ];
  const weeks = slotWeeks(couples, { finaleWeek: 5, completedThroughWeek: 3 });
  const params = {
    totalCouples: 8,
    method: "distance_based" as const,
    distancePenalty: 5,
    tierSize: null,
    tierPayStyle: "equal" as const,
    pointsPerCorrect: 20,
    slotWeeks: weeks,
  };

  it("puts each spot in the week it falls in: doubles hold two, a week without an elimination none", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((spot) => weeks.weekOf(spot))).toEqual([1, 3, 3, 4, 5, 5, 5, 5]);
  });

  it("counts a double elimination as one week and a week without one as a week", () => {
    // Spot 2 went home in Week 3; spot 1 was Week 1, two weeks earlier.
    expect(grandFinaleDistance(1, { start: 2, end: 3 }, weeks)).toEqual({ off: 2, unit: "week", weeks: 2 });
    // Spot 4 is Week 4, one week after the double.
    expect(grandFinalePredictionPoints({ ...params, predictedPosition: 4, actualPosition: 2, actualPositionEnd: 3 })).toBe(15);
  });

  it("splits the Finale's one week between its places, and counts the weeks to it from outside", () => {
    // Four couples reach the Finale, so two places off is half a week.
    expect(weeks.finaleSpots).toBe(4);
    expect(grandFinaleDistance(8, { start: 6, end: 6 }, weeks)).toEqual({ off: 2, unit: "place", weeks: 0.5 });
    expect(grandFinalePredictionPoints({ ...params, predictedPosition: 8, actualPosition: 6 })).toBe(17.5);
    // Predicted to win, out in Week 1: four weeks off.
    expect(grandFinaleDistance(8, { start: 1, end: 1 }, weeks)).toEqual({ off: 4, unit: "week", weeks: 4 });
    expect(grandFinalePredictionPoints({ ...params, predictedPosition: 8, actualPosition: 1 })).toBe(0);
  });

  it("always pays more for a couple that made the Finale than for one that went home the week before", () => {
    // A winner pick that finishes last in the Finale against one out in Week 4.
    const lastInFinale = grandFinalePredictionPoints({ ...params, predictedPosition: 8, actualPosition: 5 });
    const outTheWeekBefore = grandFinalePredictionPoints({ ...params, predictedPosition: 8, actualPosition: 4 });
    expect(lastInFinale).toBe(16.25);
    expect(outTheWeekBefore).toBe(15);
  });

  it("counts the Finale's spots from the weeks that have happened and one for each still to come", () => {
    // Sixteen couples, ten out through Week 9, Week 10 still to come, Finale in Week 11.
    const cast = [
      ...Array.from({ length: 10 }, (_, i) => ({ status: "eliminated", elimination_week: Math.min(i + 1, 9) })),
      ...Array.from({ length: 6 }, () => ({ status: "active", elimination_week: null })),
    ];
    expect(slotWeeks(cast, { finaleWeek: 11, completedThroughWeek: 9 }).finaleSpots).toBe(5);
    expect(slotWeeks([], { finaleWeek: 3, completedThroughWeek: 0 }).finaleSpots).toBe(1);
  });

  it("caps the best case of a couple still in by weeks too", () => {
    // Predicted for spot 1 (Week 1), the earliest it can still go is Week 4.
    expect(grandFinaleBestCasePoints({ ...params, predictedPosition: 1, firstOpenPosition: 4 })).toBe(5);
  });
});

describe("grandFinaleBestCasePoints", () => {
  const params = {
    totalCouples: 16,
    method: "distance_based" as const,
    distancePenalty: 5,
    tierSize: null,
    tierPayStyle: "equal" as const,
    pointsPerCorrect: 20,
    slotWeeks: perSpot,
  };

  it("is the full payout while the predicted slot is still open", () => {
    expect(grandFinaleBestCasePoints({ ...params, predictedPosition: 5, firstOpenPosition: 4 })).toBe(20);
  });

  it("drops by the distance once the predicted slot has passed", () => {
    expect(grandFinaleBestCasePoints({ ...params, predictedPosition: 3, firstOpenPosition: 4 })).toBe(15);
  });

  it("is 0 for exact_position once the slot has passed", () => {
    expect(
      grandFinaleBestCasePoints({ ...params, method: "exact_position", predictedPosition: 3, firstOpenPosition: 4 })
    ).toBe(0);
  });
});

describe("Curtain Call's Finale podium", () => {
  const outcome = (coupleId: string, o: "winner" | "runner_up" | "third_place" | "eliminated" | "withdrawn" | "safe") => ({
    coupleId,
    outcome: o,
    bonusPoints: 0,
    finalPlacement: null,
  });
  const finale = [
    outcome("first", "winner"),
    outcome("second", "runner_up"),
    outcome("third", "third_place"),
    outcome("fourth", "eliminated"),
    outcome("fifth", "eliminated"),
  ];
  const podiumPoints = (podium: [string | null, string | null, string | null]) =>
    computeWeeklyScores({
      scoringSettings: { ...settings, curtainCallNearMissEnabled: false },
      rosterSlots: [],
      danceScores: [],
      episodeOutcomes: finale,
      predictions: [
        {
          managerId: "alice",
          predictedEliminatedCoupleId: null,
          predictedEliminatedCoupleId2: null,
          predictedTopScorerCoupleId: null,
          predictedPodiumCoupleIds: podium,
        },
      ],
      isDoubleElimination: false,
      ...noScaling,
    })[0].predictionPoints;

  it("places the finalists once a winner is named, 4th and 5th both as fourth", () => {
    expect([...podiumPlaceByCouple(finale)]).toEqual([
      ["first", 1],
      ["second", 2],
      ["third", 3],
      ["fourth", 4],
      ["fifth", 4],
    ]);
    expect(podiumPlaceByCouple([outcome("fifth", "eliminated"), outcome("first", "safe")]).size).toBe(0);
    expect(podiumPlaceByCouple([...finale, outcome("fourth", "withdrawn")]).has("fourth")).toBe(false);
  });

  it("pays each place the elimination payout, whatever the In Jeopardy setting", () => {
    expect(podiumPoints(["first", "second", "third"])).toBe(60);
    expect(podiumPoints(["first", null, null])).toBe(20);
  });

  it("takes half off for each place a pick is off", () => {
    // Winner pick finished 2nd, runner-up pick finished 1st, third pick 4th.
    expect(podiumPoints(["second", "first", "fifth"])).toBe(30);
    // Two places off, and a couple that wasn't placed, pay nothing.
    expect(podiumPoints(["third", null, "first"])).toBe(0);
    expect(resolvePodiumGuess("gone", 1, podiumPlaceByCouple(finale), 20)).toEqual({ placesOff: null, points: 0 });
    expect(resolvePodiumGuess("fourth", 3, podiumPlaceByCouple(finale), 20)).toEqual({ placesOff: 1, points: 10 });
  });

  it("rounds the half from the unrounded payout", () => {
    const exact = curtainCallPayout(10.35, 5, 16);
    expect(resolvePodiumGuess("first", 1, podiumPlaceByCouple(finale), exact).points).toBe(3.23);
    expect(resolvePodiumGuess("first", 2, podiumPlaceByCouple(finale), exact).points).toBe(1.62);
    expect(podiumPreviewCopy(exact)).toBe("Each place: 3.23 pts · 1.62 pts if one place off");
    expect(podiumRuleNote()).toContain("or 50% of it one place off.");
  });

  it("pays nothing until the winner is named", () => {
    expect(
      computeWeeklyScores({
        scoringSettings: settings,
        rosterSlots: [],
        danceScores: [],
        episodeOutcomes: [outcome("fifth", "eliminated")],
        predictions: [
          {
            managerId: "alice",
            predictedEliminatedCoupleId: null,
            predictedEliminatedCoupleId2: null,
            predictedTopScorerCoupleId: null,
            predictedPodiumCoupleIds: ["first", "second", "fifth"],
          },
        ],
        isDoubleElimination: false,
        ...noScaling,
      })[0].predictionPoints
    ).toBe(0);
  });
});
