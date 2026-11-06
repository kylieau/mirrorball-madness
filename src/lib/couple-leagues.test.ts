import { describe, expect, it } from "vitest";
import { buildCoupleLeagueRows, type CoupleLeagueInput } from "./couple-leagues";
import { buildCouplesLeaderboard } from "./couples-leaderboard";
import type { ScoringSettings } from "./scoring";

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
  { id: "A", status: "active", elimination_week: null },
  { id: "B", status: "active", elimination_week: null },
];

const weeks = [1, 2].map((weekNumber) => ({
  weekNumber,
  danceScores: [
    { episodeId: `ep${weekNumber}`, coupleId: "A", totalScore: 24, scaledScore: 24, maxScore: null },
    { episodeId: `ep${weekNumber}`, coupleId: "B", totalScore: 20, scaledScore: 20, maxScore: null },
  ],
  outcomes: [
    { coupleId: "A", outcome: "safe" as const, bonusPoints: 0 },
    { coupleId: "B", outcome: "safe" as const, bonusPoints: 0 },
  ],
}));

const league = (over: Partial<CoupleLeagueInput>): CoupleLeagueInput => ({
  id: "L",
  name: "Alpha",
  myTeamId: "me",
  managerNames: new Map([["pat", "Pat & Sam"]]),
  scoring,
  anchorWeek: 1,
  categoryWeight: 1,
  slots: [],
  ...over,
});

describe("buildCoupleLeagueRows", () => {
  it("names the holder: the viewer's own team, another manager, or nobody", () => {
    const rows = buildCoupleLeagueRows({
      coupleId: "A",
      weeks,
      couples,
      leagues: [
        league({ id: "1", slots: [{ managerId: "me", coupleId: "A", startWeek: 1, endWeek: null }] }),
        league({ id: "2", slots: [{ managerId: "pat", coupleId: "A", startWeek: 1, endWeek: null }] }),
        league({ id: "3" }),
      ],
    });
    expect(rows.map((row) => row.owner)).toEqual([{ kind: "you" }, { kind: "manager", name: "Pat & Sam" }, { kind: "undrafted" }]);
  });

  it("reads the same judges' points as that league's Couples Leaderboard row", () => {
    const input = league({
      anchorWeek: 2,
      categoryWeight: 0.5,
      slots: [{ managerId: "pat", coupleId: "A", startWeek: 1, endWeek: null }],
    });
    const [row] = buildCoupleLeagueRows({ coupleId: "A", weeks, couples, leagues: [input] });
    const standing = buildCouplesLeaderboard({ ...input, weeks, couples }).find((s) => s.coupleId === "A")!;
    expect(row.judgesPoints).toBe(standing.judgesPoints);
    expect(row.judgesPoints).toBe(6);
  });
});
