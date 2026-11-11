import { describe, expect, it } from "vitest";
import { buildCouplesLeaderboard } from "./couples-leaderboard";
import { coupleValueCents, danceCardV2Rule, danceCardV3Rule, danceCardWeekEpisodeIds, type DanceCardWeek } from "./dance-card-v2";
import { draftWeekManagerScores, scoresReplacingDraftWeek } from "./draft-scores";
import { judgePointsThroughWeek } from "./roster-couple-points";
import { buildScoreHistory, type HistoryWeekData, type ManagerHistoryInput } from "./score-history";
import type { DanceScore, ScoringSettings } from "./scoring";
import { buildWeeklyScoreRows, danceCardPriorWeeks } from "./weekly-score-rows";

const rule = danceCardV2Rule(2);
const value = (s: number) => coupleValueCents(s, rule) / 100;
const credit = (before: number, after: number) => (coupleValueCents(after, rule) - coupleValueCents(before, rule)) / 100;

const scoring: ScoringSettings = {
  judgesScoreMultiplier: 0.2449,
  survivalPoints: 1.56,
  eliminationPredictionPoints: 10,
  topScorerPredictionPoints: 7,
  firstPlacePoints: 26.09,
  secondPlacePoints: 13.04,
  thirdPlacePoints: 6.96,
  fourthPlacePoints: 3.48,
  fifthPlacePoints: 1.74,
  curtainCallNearMissEnabled: true,
};

const dance = (episodeId: string, coupleId: string, total: number): DanceScore => ({
  episodeId, coupleId, totalScore: total, scaledScore: total, maxScore: null,
});

// Harry danced 18, 24, 27 in Weeks 2–4 with a 2-point Fantasy Bonus in
// Week 3; Giada danced 12 in Week 2 and went home. One manager holds both.
const weeks: HistoryWeekData[] = [
  { weekNumber: 1, danceScores: [dance("e1", "harry", 21)], outcomes: [], inJeopardyCoupleIds: [], isDoubleElimination: false },
  {
    weekNumber: 2,
    danceScores: [dance("e2", "harry", 18), dance("e2", "giada", 12)],
    outcomes: [
      { coupleId: "harry", outcome: "safe", bonusPoints: 0 },
      { coupleId: "giada", outcome: "eliminated", bonusPoints: 0 },
    ],
    inJeopardyCoupleIds: [],
    isDoubleElimination: false,
  },
  {
    weekNumber: 3,
    danceScores: [dance("e3", "harry", 24)],
    outcomes: [{ coupleId: "harry", outcome: "safe", bonusPoints: 2 }],
    inJeopardyCoupleIds: [],
    isDoubleElimination: false,
  },
  {
    weekNumber: 4,
    danceScores: [dance("e4", "harry", 27)],
    outcomes: [{ coupleId: "harry", outcome: "safe", bonusPoints: 0 }],
    inJeopardyCoupleIds: [],
    isDoubleElimination: false,
  },
];
const couples = [
  { id: "harry", status: "active", elimination_week: null },
  { id: "giada", status: "eliminated", elimination_week: 2 },
];
const slots = [
  { managerId: "m", coupleId: "harry", startWeek: 1, endWeek: null },
  { managerId: "m", coupleId: "giada", startWeek: 1, endWeek: null },
];

// What publishing stores for the manager each week.
function storedRosterPoints(version = "v2"): Map<number, number> {
  const snapshotLike = {
    episodes: ["e1", "e2", "e3", "e4"].map((id, i) => ({ id, week_id: `w${i + 1}`, results_published_at: "2026-10-01", episode_number: i + 1 })),
    weeks: [1, 2, 3, 4].map((n) => ({ id: `w${n}`, week_number: n })),
    dances: weeks.flatMap((w) =>
      w.danceScores.map((d) => ({ episode_id: d.episodeId, couple_id: d.coupleId, total_score: d.totalScore, scaled_score: d.scaledScore, max_score: null }))
    ),
    outcomes: weeks.flatMap((w) =>
      w.outcomes.map((o) => ({ episode_id: `e${w.weekNumber}`, couple_id: o.coupleId, bonus_points: o.bonusPoints, outcome: o.outcome }))
    ),
  };
  const rows = new Map<number, number>();
  for (const week of weeks) {
    const episodeId = `e${week.weekNumber}`;
    const [row] = buildWeeklyScoreRows(
      {
        episodes: snapshotLike.episodes,
        dances: snapshotLike.dances.filter((d) => d.episode_id === episodeId),
        outcomes: [],
        jeopardy: [],
        couples,
        leagues: [{ id: "l", roster_size: 2 }],
        settings: [{ league_id: "l", dance_card_version: version, judges_score_starts_week: 2, judges_score_category_weight: 2, eliminations_category_weight: 1, bonus_picks_category_weight: 1 } as never],
        rosters: slots.map((s) => ({ league_id: "l", manager_id: s.managerId, couple_id: s.coupleId, start_week: s.startWeek, end_week: s.endWeek })),
        predictions: [],
        lateUnlocks: [],
        grandFinalePredictions: [],
        finaleWeekNumber: 99,
        danceCardPriorWeeks: danceCardPriorWeeks(snapshotLike, week.weekNumber),
      },
      { id: `w${week.weekNumber}`, week_number: week.weekNumber, is_double_elimination_week: false },
      episodeId,
      snapshotLike.outcomes.filter((o) => o.episode_id === episodeId)
    );
    rows.set(week.weekNumber, row ? Number(row.roster_points) : 0);
  }
  return rows;
}

describe("Dance Card v2 readers", () => {
  it("stores the credits the ledger pays, Anchor Week 2 on", () => {
    expect([...storedRosterPoints()]).toEqual([
      [1, 0],
      [2, credit(0, 18) + credit(0, 12)],
      [3, credit(18, 44)],
      [4, credit(44, 71)],
    ]);
  });

  it("Couples Leaderboard rows add up to the stored Dance Card module", () => {
    const standings = buildCouplesLeaderboard({ rule, scoring, anchorWeek: 2, categoryWeight: 2, weeks, couples, slots });
    expect(standings.find((s) => s.coupleId === "harry")).toEqual({
      coupleId: "harry", ownerId: "m", judgesPoints: value(71) * 2, bonusPoints: 0, totalPoints: value(71) * 2,
    });
    const stored = [...storedRosterPoints().values()].reduce((sum, p) => sum + p, 0) * 2;
    expect(standings.reduce((sum, s) => sum + s.totalPoints, 0)).toBeCloseTo(stored, 6);
  });

  it("roster lines show the week's credit and the season so far", () => {
    const scores = weeks.flatMap((w) => w.danceScores.map((d) => ({ ...d, weekNumber: w.weekNumber })));
    const bonuses = weeks.flatMap((w) => w.outcomes.map((o) => ({ weekNumber: w.weekNumber, coupleId: o.coupleId, bonusPoints: o.bonusPoints })));
    const points = judgePointsThroughWeek({
      slots: slots.slice(0, 1), scores, bonuses, rule, judgesScoreStartsWeek: 2, week: 4, multiplier: 0.2449, categoryWeight: 1,
    });
    expect(points.get("harry")).toEqual({ week: credit(44, 71), total: value(71) });
  });

  it("Score History has one line per couple-week, summing to the stored rows", () => {
    const input: ManagerHistoryInput = {
      scoring,
      danceCardRule: rule,
      anchorWeek: 2,
      categoryWeights: { judges: 2, eliminations: 1, bonus: 1 },
      grandFinale: { method: "distance_based", distancePenalty: 1, tierSize: null, tierPayStyle: "equal", pointsPerCorrect: 6 },
      couples,
      coupleNames: new Map([["harry", "Harry"], ["giada", "Giada"]]),
      weeks,
      rosterSlots: slots,
      predictions: [],
      grandFinalePredictions: [],
      finaleWeek: 99,
    };
    const lines = buildScoreHistory(input).filter((line) => line.module === "danceCard");
    const rate = (points: number, weekInput: number) => String(Math.round((points / weekInput) * 1000) / 1000);
    // Week 3's 2-point Fantasy Bonus keeps its own line at the week's rate.
    const week3Bonus = Math.round(2 * (credit(18, 44) / 26) * 100) / 100;
    expect(lines.map((line) => [line.weekNumber, line.label, line.points])).toEqual(
      expect.arrayContaining([
        [4, `Harry: Jdg 27 × ${rate(credit(44, 71), 27)} × 2 Wt`, credit(44, 71) * 2],
        [3, `Harry: Jdg 24 × ${rate(credit(18, 44), 26)} × 2 Wt`, Math.round((credit(18, 44) - week3Bonus) * 2 * 100) / 100],
        [3, "Harry: Bonus × 2 Wt", week3Bonus * 2],
        [2, `Giada: Jdg 12 × ${rate(credit(0, 12), 12)} × 2 Wt`, credit(0, 12) * 2],
      ])
    );
    expect(lines.some((line) => /Survival|Podium|Season/.test(line.label))).toBe(false);
    const stored = [...storedRosterPoints().values()].reduce((sum, p) => sum + p, 0) * 2;
    expect(lines.reduce((sum, line) => sum + line.points, 0)).toBeCloseTo(stored, 6);
  });

  it("draft night pays the week's credit over the earlier weeks and keeps stored picks", () => {
    const priorWeeks: DanceCardWeek[] = weeks.slice(0, 3).map((w) => ({ weekNumber: w.weekNumber, danceScores: w.danceScores, outcomes: w.outcomes }));
    const [manager] = draftWeekManagerScores({
      weekNumber: 4,
      anchorWeek: 2,
      judgesScoreMultiplier: 0.2449,
      judgesCategoryWeight: 2,
      rosterSlots: [{ managerId: "m", coupleId: "harry" }],
      danceScores: [dance("e4", "harry", 27)],
      danceCard: { rule, priorWeeks, weekOutcomes: [] },
    });
    expect(manager).toEqual({ managerId: "m", rosterPoints: credit(44, 71), totalPoints: credit(44, 71) * 2 });
    const replaced = scoresReplacingDraftWeek(
      [{ week_id: "w4", manager_id: "m", roster_points: 1, prediction_points: 3, grand_finale_points: 1, total_points: 6 }],
      "w4",
      [manager],
      { judges_score_category_weight: 2, eliminations_category_weight: 1, bonus_picks_category_weight: 1 }
    );
    expect(replaced).toEqual([
      {
        week_id: "w4",
        manager_id: "m",
        roster_points: credit(44, 71),
        prediction_points: 3,
        grand_finale_points: 1,
        lifeline_points: 0,
        transfer_points: 0,
        total_points: Math.round((credit(44, 71) * 2 + 4) * 100) / 100,
      },
    ]);
  });
});

// Worked by hand at 0.2731 a judges' point and survival 3.00 × √n:
// Week 2 Harry 18 → 4.92 + 3.00, Giada 12 → 3.28 (eliminated, no survival);
// Week 3 Harry 24 → 6.55 + 1.24 + the 2.00 Fantasy Bonus; Week 4 Harry 27 →
// 7.37 + 0.96.
describe("Dance Card v3 readers", () => {
  const v3 = danceCardV3Rule(2);

  it("stores judges, tapering survival and the bonus at face value", () => {
    expect([...storedRosterPoints("v3")]).toEqual([[1, 0], [2, 11.2], [3, 9.79], [4, 8.33]]);
  });

  it("Couples Leaderboard splits judges from survival and bonus, adding up to the stored module", () => {
    const standings = buildCouplesLeaderboard({ rule: v3, scoring, anchorWeek: 2, categoryWeight: 2, weeks, couples, slots });
    expect(standings.find((s) => s.coupleId === "harry")).toEqual({
      coupleId: "harry", ownerId: "m", judgesPoints: 37.68, bonusPoints: 14.4, totalPoints: 52.08,
    });
    expect(standings.reduce((sum, s) => sum + s.totalPoints, 0)).toBeCloseTo((11.2 + 9.79 + 8.33) * 2, 6);
  });

  it("roster lines are judges' points only", () => {
    const scores = weeks.flatMap((w) => w.danceScores.map((d) => ({ ...d, weekNumber: w.weekNumber })));
    const outcomes = weeks.flatMap((w) => w.outcomes.map((o) => ({ weekNumber: w.weekNumber, coupleId: o.coupleId, bonusPoints: o.bonusPoints, outcome: o.outcome })));
    const points = judgePointsThroughWeek({
      slots: slots.slice(0, 1), scores, bonuses: outcomes, rule: v3, judgesScoreStartsWeek: 2, week: 4, multiplier: 0.2449, categoryWeight: 1,
    });
    expect(points.get("harry")).toEqual({ week: 7.37, total: 18.84 });
  });

  it("Score History reads like v1 and sums to the stored rows", () => {
    const lines = buildScoreHistory({
      scoring,
      danceCardRule: v3,
      anchorWeek: 2,
      categoryWeights: { judges: 2, eliminations: 1, bonus: 1 },
      grandFinale: { method: "distance_based", distancePenalty: 1, tierSize: null, tierPayStyle: "equal", pointsPerCorrect: 6 },
      couples,
      coupleNames: new Map([["harry", "Harry"], ["giada", "Giada"]]),
      weeks,
      rosterSlots: slots,
      predictions: [],
      grandFinalePredictions: [],
      finaleWeek: 99,
    }).filter((line) => line.module === "danceCard");
    expect(lines.map((line) => [line.weekNumber, line.label, line.points])).toEqual(
      expect.arrayContaining([
        [4, "Harry: Jdg 27 × 0.273 × 2 Wt", 14.74],
        [4, "Harry: Survival × 2 Wt", 1.92],
        [3, "Harry: Jdg 24 × 0.273 × 2 Wt", 13.1],
        [3, "Harry: Survival × 2 Wt", 2.48],
        [3, "Harry: Bonus × 2 Wt", 4],
        [2, "Harry: Survival × 2 Wt", 6],
        [2, "Giada: Jdg 12 × 0.273 × 2 Wt", 6.56],
      ])
    );
    expect(lines.some((line) => /Giada: Survival|Podium/.test(line.label))).toBe(false);
    expect(lines.reduce((sum, line) => sum + line.points, 0)).toBeCloseTo((11.2 + 9.79 + 8.33) * 2, 6);
  });
});

describe("a two-night week still posting", () => {
  // Night 1 (published) scored 24 with a 2-point Fantasy Bonus; night 2 is
  // posting a 30. Harry came in with 42.
  const prior: HistoryWeekData[] = [
    { weekNumber: 2, danceScores: [dance("e2", "harry", 18)], outcomes: [{ coupleId: "harry", outcome: "safe", bonusPoints: 0 }], inJeopardyCoupleIds: [], isDoubleElimination: false },
    { weekNumber: 3, danceScores: [dance("e3", "harry", 24)], outcomes: [{ coupleId: "harry", outcome: "safe", bonusPoints: 0 }], inJeopardyCoupleIds: [], isDoubleElimination: false },
  ];
  const fullWeek: HistoryWeekData = {
    weekNumber: 4,
    danceScores: [dance("n1", "harry", 24), dance("n2", "harry", 30)],
    outcomes: [{ coupleId: "harry", outcome: "safe", bonusPoints: 2 }],
    inJeopardyCoupleIds: [],
    isDoubleElimination: false,
  };
  const shownWeek: HistoryWeekData = { ...fullWeek, danceScores: [dance("n2", "harry", 30)], outcomes: [] };

  it("reads the published sibling night as input, whichever nights are shown", () => {
    expect(danceCardWeekEpisodeIds(["n2"], [{ id: "n1", results_published_at: "2026-11-11" }, { id: "n2", results_published_at: null }])).toEqual(["n2", "n1"]);
  });

  it("Score History credits the whole week while showing the posting night", () => {
    const lines = buildScoreHistory({
      scoring,
      danceCardRule: rule,
      danceCardWeeks: [...prior, fullWeek],
      anchorWeek: 2,
      categoryWeights: { judges: 1, eliminations: 1, bonus: 1 },
      grandFinale: { method: "distance_based", distancePenalty: 1, tierSize: null, tierPayStyle: "equal", pointsPerCorrect: 6 },
      couples,
      coupleNames: new Map([["harry", "Harry"]]),
      weeks: [...prior, shownWeek],
      rosterSlots: slots.slice(0, 1),
      predictions: [],
      grandFinalePredictions: [],
      finaleWeek: 99,
    });
    const rate = credit(42, 98) / 56;
    const bonus = Math.round(2 * rate * 100) / 100;
    expect(lines.filter((line) => line.weekNumber === 4).map((line) => [line.label, line.points])).toEqual([
      [`Harry: Jdg 54 × ${Math.round(rate * 1000) / 1000}`, Math.round((credit(42, 98) - bonus) * 100) / 100],
      ["Harry: Bonus", bonus],
    ]);
  });
});
