import { describe, expect, it } from "vitest";
import { buildCouplesLeaderboard } from "./couples-leaderboard";
import { computeWeeklyScores, type ScoringSettings } from "./scoring";

const scoring: ScoringSettings = {
  judgesScoreMultiplier: 0.5,
  survivalPoints: 2,
  eliminationPredictionPoints: 0,
  topScorerPredictionPoints: 0,
  firstPlacePoints: 10,
  secondPlacePoints: 6,
  thirdPlacePoints: 4,
  fourthPlacePoints: 2,
  fifthPlacePoints: 1,
  curtainCallNearMissEnabled: true,
};

const couples = [
  { id: "A", status: "winner", elimination_week: null },
  { id: "B", status: "runner_up", elimination_week: null },
  { id: "C", status: "eliminated", elimination_week: 2 },
  { id: "D", status: "eliminated", elimination_week: 1 },
];

const weeks = [
  {
    weekNumber: 1,
    danceScores: [
      { coupleId: "A", totalScore: 20 },
      { coupleId: "B", totalScore: 18 },
      { coupleId: "C", totalScore: 16 },
      { coupleId: "D", totalScore: 10 },
    ],
    outcomes: [
      { coupleId: "A", outcome: "safe" as const, bonusPoints: 0 },
      { coupleId: "B", outcome: "safe" as const, bonusPoints: 1 },
      { coupleId: "C", outcome: "safe" as const, bonusPoints: 0 },
      { coupleId: "D", outcome: "eliminated" as const, bonusPoints: 0 },
    ],
  },
  {
    weekNumber: 2,
    danceScores: [
      { coupleId: "A", totalScore: 28 },
      { coupleId: "B", totalScore: 26 },
      { coupleId: "C", totalScore: 14 },
    ],
    outcomes: [
      { coupleId: "A", outcome: "winner" as const, bonusPoints: 0 },
      { coupleId: "B", outcome: "runner_up" as const, bonusPoints: 0 },
      { coupleId: "C", outcome: "eliminated" as const, bonusPoints: 0 },
    ],
  },
];

const slots = [
  { managerId: "m1", coupleId: "A", startWeek: 1, endWeek: null },
  { managerId: "m2", coupleId: "B", startWeek: 2, endWeek: null },
  { managerId: "m2", coupleId: "C", startWeek: 1, endWeek: 2 },
];

const placements: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };

const byId = (rows: ReturnType<typeof buildCouplesLeaderboard>) => new Map(rows.map((r) => [r.coupleId, r]));

describe("buildCouplesLeaderboard", () => {
  const rows = byId(buildCouplesLeaderboard({ scoring, anchorWeek: 1, categoryWeight: 1, weeks, couples, slots }));

  it("splits judges' points from survival, podium and bonus points", () => {
    expect(rows.get("A")).toMatchObject({ ownerId: "m1", judgesPoints: 24, bonusPoints: 14, totalPoints: 38 });
  });

  it("counts a couple only for the weeks its holder held it", () => {
    expect(rows.get("B")).toMatchObject({ ownerId: "m2", judgesPoints: 13, bonusPoints: 8 });
  });

  it("keeps a dropped couple with its last holder and pays no survival on the eliminating week", () => {
    expect(rows.get("C")).toMatchObject({ ownerId: "m2", judgesPoints: 15, bonusPoints: 6 });
  });

  it("scores an undrafted couple as a what-if from the Anchor Week", () => {
    expect(rows.get("D")).toMatchObject({ ownerId: null, judgesPoints: 5, bonusPoints: 2 });
  });

  it("skips weeks before the Anchor Week and applies the category weight", () => {
    const late = byId(buildCouplesLeaderboard({ scoring, anchorWeek: 2, categoryWeight: 0.5, weeks, couples, slots }));
    expect(late.get("A")).toMatchObject({ judgesPoints: 7, bonusPoints: 6 });
    expect(late.get("D")).toMatchObject({ judgesPoints: 0, bonusPoints: 0 });
  });

  it("adds up to the engine's Dance Card total for a manager", () => {
    const engineTotal = weeks.reduce((sum, week) => {
      const score = computeWeeklyScores({
        scoringSettings: scoring,
        rosterSlots: slots
          .filter((s) => s.managerId === "m2" && s.startWeek <= week.weekNumber && (s.endWeek ?? 99) >= week.weekNumber)
          .map((s) => ({ managerId: "m2", coupleId: s.coupleId })),
        danceScores: week.danceScores,
        episodeOutcomes: week.outcomes.map((o) => ({
          ...o,
          finalPlacement: o.outcome === "safe" ? null : placements[o.coupleId],
        })),
        predictions: [],
        isDoubleElimination: false,
        couplesRemaining: 4,
        totalCouples: 4,
      }).find((s) => s.managerId === "m2");
      return sum + (score?.rosterPoints ?? 0);
    }, 0);
    const owned = [...rows.values()].filter((r) => r.ownerId === "m2");
    expect(owned.reduce((sum, r) => sum + r.totalPoints, 0)).toBeCloseTo(engineTotal, 2);
  });
});
