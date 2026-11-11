import { describe, expect, it } from "vitest";
import type { DanceCardWeek } from "./dance-card-v2";
import {
  buildLifelineEqualizer,
  buildLifelinePayouts,
  isDeadSlot,
  lifelineStandingsPreview,
  recomputeLifelineEqualizers,
  type LifelineSeason,
} from "./lifeline";

// A v3 league with two-couple rosters (rate 0.2731), Anchor Week 2, Dance
// Card weight 0.5. Out goes home in Week 2, Late in Week 3; Week 5 is the
// Finale, where Fourth finishes as an eliminated couple.
const dance = (coupleId: string, week: number, scaledScore: number) => ({
  episodeId: `e${week}`, coupleId, totalScore: scaledScore, scaledScore, maxScore: 30,
});
const outcome = (coupleId: string, o: string, bonusPoints = 0) => ({ coupleId, outcome: o, bonusPoints });
const danceCardWeeks: DanceCardWeek[] = [
  { weekNumber: 2, danceScores: ["star", "steady", "fourth", "late", "out"].map((c) => dance(c, 2, 24)),
    outcomes: [outcome("star", "safe"), outcome("steady", "safe"), outcome("fourth", "safe"), outcome("late", "safe"), outcome("out", "eliminated")] },
  { weekNumber: 3, danceScores: [dance("star", 3, 30), dance("steady", 3, 24), dance("fourth", 3, 24), dance("late", 3, 21)],
    outcomes: [outcome("star", "safe", 2), outcome("steady", "safe"), outcome("fourth", "safe"), outcome("late", "withdrawn")] },
  { weekNumber: 4, danceScores: [dance("star", 4, 27), dance("fourth", 4, 24)],
    outcomes: [outcome("star", "safe"), outcome("steady", "bye"), outcome("fourth", "safe")] },
  { weekNumber: 5, danceScores: [dance("star", 5, 30), dance("steady", 5, 27), dance("fourth", 5, 24)],
    outcomes: [outcome("star", "winner"), outcome("steady", "runner_up"), outcome("fourth", "eliminated")] },
];
const season: LifelineSeason = {
  weeks: [2, 3, 4, 5].map((n) => ({ id: `w${n}`, week_number: n, is_finale: n === 5 })),
  danceCardWeeks,
  couples: [
    { id: "star", status: "winner", elimination_week: null },
    { id: "steady", status: "runner_up", elimination_week: null },
    { id: "fourth", status: "eliminated", elimination_week: 5 },
    { id: "late", status: "withdrawn", elimination_week: 3 },
    { id: "out", status: "eliminated", elimination_week: 2 },
  ],
  leagues: [{ id: "league", roster_size: 2, lifeline_starts_week: 5 }, { id: "classic", roster_size: 2 }],
  settings: [
    { league_id: "league", dance_card_version: "v3", judges_score_starts_week: 2, judges_score_category_weight: 0.5 },
    { league_id: "classic", dance_card_version: "v1", judges_score_starts_week: 2, judges_score_category_weight: 1 },
  ],
  rosters: [
    { league_id: "league", manager_id: "ann", slot_number: 1, couple_id: "out", start_week: 1, end_week: null },
    { league_id: "league", manager_id: "ann", slot_number: 2, couple_id: "late", start_week: 1, end_week: null },
    { league_id: "league", manager_id: "bo", slot_number: 1, couple_id: "star", start_week: 1, end_week: null },
    { league_id: "league", manager_id: "bo", slot_number: 2, couple_id: "out", start_week: 1, end_week: 3 },
    { league_id: "league", manager_id: "bo", slot_number: 2, couple_id: "steady", start_week: 4, end_week: null },
  ],
};
const pick = (manager_id: string, week: number, slot_number: number, couple_id: string, league_id = "league") => ({
  league_id, manager_id, week_id: `w${week}`, slot_number, couple_id,
});
const paid = (rows: ReturnType<typeof buildLifelinePayouts>) =>
  rows.map(({ credit, survived, points, weighted_points }) => ({ credit, survived, points, weighted_points }));

describe("isDeadSlot", () => {
  it("is dead from the week after the couple goes home, until the spot is refilled", () => {
    expect(isDeadSlot(season, "league", "ann", 1, 2)).toBe(false);
    expect(isDeadSlot(season, "league", "ann", 1, 3)).toBe(true);
    expect(isDeadSlot(season, "league", "ann", 2, 3)).toBe(false);
    expect(isDeadSlot(season, "league", "ann", 2, 4)).toBe(true);
    expect(isDeadSlot(season, "league", "bo", 2, 3)).toBe(true);
    expect(isDeadSlot(season, "league", "bo", 2, 4)).toBe(false);
    expect(isDeadSlot(season, "league", "bo", 1, 5)).toBe(false);
  });
});

describe("buildLifelinePayouts", () => {
  it("pays half the couple's week, then the Dance Card weight", () => {
    // Star's Week 3: 30 × 0.2731 = 8.19, a 1.24 survival step and a 2.00 bonus.
    expect(paid(buildLifelinePayouts(season, [pick("ann", 3, 1, "star")]))).toEqual([
      { credit: 11.43, survived: true, points: 5.72, weighted_points: 2.86 },
    ]);
  });

  it("pays half the judges' points of a couple that leaves that week, and nothing for one that sits out", () => {
    // Late withdraws in Week 3 with no survival step; Steady has a bye in Week 4.
    expect(paid(buildLifelinePayouts(season, [pick("ann", 3, 1, "late"), pick("ann", 4, 1, "steady")]))).toEqual([
      { credit: 5.74, survived: false, points: 2.87, weighted_points: 1.44 },
      { credit: 0, survived: false, points: 0, weighted_points: 0 },
    ]);
  });

  it("pays every Finale couple, whatever its placement", () => {
    // Fourth is entered as Eliminated but survives the Finale like the
    // podium: 24 × 0.2731 = 6.55 and a fourth survival step, 0.80. Star's
    // judges are 8.19.
    expect(paid(buildLifelinePayouts(season, [pick("ann", 5, 1, "fourth"), pick("ann", 5, 2, "star")]))).toEqual([
      { credit: 7.35, survived: true, points: 3.68, weighted_points: 1.84 },
      { credit: 8.99, survived: true, points: 4.5, weighted_points: 2.25 },
    ]);
  });

  it("pays nothing on a spot that isn't dead that week, or outside a ledger league", () => {
    const rows = buildLifelinePayouts(season, [pick("bo", 4, 2, "star"), pick("ann", 2, 1, "star"), pick("ann", 3, 1, "star", "classic")]);
    expect(rows.map((row) => row.points)).toEqual([0, 0, 0]);
    expect(rows[0]).toMatchObject({ credit: 8.33, survived: true });
  });
});

describe("buildLifelineEqualizer", () => {
  // The average Lifeline: Week 3 is half of (11.43 + 7.79 + 7.79 + 5.74) / 4,
  // Late's withdrawal included, Week 4 half of (8.33 + 7.51) / 2 since
  // Steady sat out.
  const week3 = (0.5 * (11.43 + 7.79 + 7.79 + 5.74)) / 4;
  const week4 = (0.5 * (8.33 + 7.51)) / 2;

  it("adds the average Lifeline for each week a spot was dead before the start", () => {
    const rows = buildLifelineEqualizer(season, "league", 5);
    expect(rows).toEqual([
      { managerId: "ann", points: 12.01, weightedPoints: 6.01, detail: { weeks: [3, 4], slotWeeks: 3 } },
      { managerId: "bo", points: 4.09, weightedPoints: 2.05, detail: { weeks: [3], slotWeeks: 1 } },
    ]);
    // Ann: one dead spot in Week 3, two in Week 4, rounded once.
    expect(rows[0].points).toBeCloseTo(week3 + 2 * week4, 2);
  });

  it("stops at the start week and skips a league without a ledger", () => {
    expect(buildLifelineEqualizer(season, "league", 4).map((row) => row.detail)).toEqual([
      { weeks: [3], slotWeeks: 1 },
      { weeks: [3], slotWeeks: 1 },
    ]);
    expect(buildLifelineEqualizer(season, "league", 3)).toEqual([]);
    expect(buildLifelineEqualizer(season, "classic", 5)).toEqual([]);
  });
});

describe("recomputeLifelineEqualizers", () => {
  it("returns today's amount for each stored row, and zero when its dead weeks are gone", () => {
    const stored = [
      { id: "a", league_id: "league", manager_id: "ann" },
      { id: "c", league_id: "league", manager_id: "cy" },
    ];
    expect(recomputeLifelineEqualizers(season, stored)).toEqual([
      { id: "a", points: 12.01, weighted_points: 6.01, detail: { weeks: [3, 4], slotWeeks: 3 } },
      { id: "c", points: 0, weighted_points: 0, detail: { weeks: [], slotWeeks: 0 } },
    ]);
  });
});

describe("lifelineStandingsPreview", () => {
  const equalizer = [
    { managerId: "ann", points: 12.01, weightedPoints: 6.01, detail: { weeks: [3, 4], slotWeeks: 3 } },
    { managerId: "bo", points: 4.09, weightedPoints: 2.05, detail: { weeks: [3], slotWeeks: 1 } },
  ];

  it("ranks the standings without and with the Equalizer", () => {
    const rows = lifelineStandingsPreview(
      [
        { managerId: "cy", total: 60 },
        { managerId: "bo", total: 58 },
        { managerId: "ann", total: 55 },
      ],
      equalizer
    );
    expect(rows).toEqual([
      { managerId: "ann", equalizer: 6.01, slotWeeks: 3, weeks: [3, 4], before: 55, after: 61.01, rankBefore: 3, rankAfter: 1 },
      { managerId: "bo", equalizer: 2.05, slotWeeks: 1, weeks: [3], before: 58, after: 60.05, rankBefore: 2, rankAfter: 2 },
      { managerId: "cy", equalizer: 0, slotWeeks: 0, weeks: [], before: 60, after: 60, rankBefore: 1, rankAfter: 3 },
    ]);
  });

  it("keeps the leaderboard's order for managers level on points", () => {
    const rows = lifelineStandingsPreview(
      [
        { managerId: "cy", total: 40 },
        { managerId: "dee", total: 40 },
      ],
      []
    );
    expect(rows.map((row) => [row.managerId, row.rankBefore, row.rankAfter])).toEqual([
      ["cy", 1, 1],
      ["dee", 2, 2],
    ]);
  });
});
