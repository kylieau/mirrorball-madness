import { describe, expect, it } from "vitest";
import { bandOf, bandPayoutFraction, computeGrandFinalePoints, computeWeeklyScores, curtainCallPayout, type ScoringSettings } from "./scoring";

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
  bonusPicksFirstPlacePoints: 40,
  bonusPicksSecondPlacePoints: 20,
  bonusPicksThirdPlacePoints: 10,
  bonusPicksFourthPlacePoints: 5,
  bonusPicksFifthPlacePoints: 2,
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
        { coupleId: "couple-1", totalScore: 24 },
        { coupleId: "couple-2", totalScore: 18 },
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

  it("sums multiple dances for the same couple in a multi-dance week", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [
        { coupleId: "couple-1", totalScore: 24 },
        { coupleId: "couple-1", totalScore: 27 },
      ],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].rosterPoints).toBe(24 + 27 + 10);
  });

  it("a judges'-save override (bottom two but saved) still counts as survived, not eliminated", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ coupleId: "couple-1", totalScore: 20 }],
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

  it("awards the split placement bonus (Dance-Card-half in rosterPoints, Grand-Finale-half in grandFinalePoints) for 1st/2nd/3rd", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [
        { managerId: "alice", coupleId: "winner-couple" },
        { managerId: "bob", coupleId: "runner-up-couple" },
        { managerId: "carol", coupleId: "third-couple" },
      ],
      danceScores: [
        { coupleId: "winner-couple", totalScore: 30 },
        { coupleId: "runner-up-couple", totalScore: 29 },
        { coupleId: "third-couple", totalScore: 28 },
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
    expect(alice.grandFinalePoints).toBe(40); // Grand Finale half of 1st
    expect(bob.rosterPoints).toBe(29 + 10 + 50); // dance + survival + Dance Card 2nd
    expect(bob.grandFinalePoints).toBe(20); // Grand Finale half of 2nd
    expect(carol.rosterPoints).toBe(28 + 10 + 25); // dance + survival + Dance Card 3rd
    expect(carol.grandFinalePoints).toBe(10); // Grand Finale half of 3rd
  });

  it("awards the split placement bonus for 4th/5th place too, extending past the podium", () => {
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
    expect(alice.grandFinalePoints).toBe(5); // Grand Finale half of 4th
    expect(bob.rosterPoints).toBe(6); // Dance Card 5th
    expect(bob.grandFinalePoints).toBe(2); // Grand Finale half of 5th
  });

  it("does not award a placement bonus when finalPlacement is omitted, even for a 'winner' outcome", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ coupleId: "couple-1", totalScore: 30 }],
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
      danceScores: [{ coupleId: "couple-1", totalScore: 10 }],
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
      danceScores: [{ coupleId: "couple-1", totalScore: 20 }],
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
        { coupleId: "couple-1", totalScore: 24 },
        { coupleId: "couple-2", totalScore: 27 },
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
      danceScores: [{ coupleId: "couple-1", totalScore: 20 }],
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
    expect(alice.totalPoints).toBe(30 * 2 + 15 * 0.5 + 10 * 1);
  });

  it("defaults totalPoints to a flat sum when no weights/grand-finale points are passed", () => {
    const result = computeWeeklyScores({
      scoringSettings: settings,
      rosterSlots: [{ managerId: "alice", coupleId: "couple-1" }],
      danceScores: [{ coupleId: "couple-1", totalScore: 20 }],
      episodeOutcomes: [{ coupleId: "couple-1", outcome: "safe", bonusPoints: 0, finalPlacement: null }],
      predictions: [],
      isDoubleElimination: false,
      ...noScaling,
    });

    expect(result[0].totalPoints).toBe(30);
    expect(result[0].grandFinalePoints).toBe(0);
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
        { coupleId: "couple-1", totalScore: 24 },
        { coupleId: "couple-2", totalScore: 27 },
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
    // eliminationPredictionPoints=20, topScorerPredictionPoints=15, both at ratio 4/8 = 0.5
    expect(alice.predictionPoints).toBe(20 * 0.5 + 15 * 0.5);
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
