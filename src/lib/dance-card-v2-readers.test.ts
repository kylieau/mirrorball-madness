import { describe, expect, it } from "vitest";
import { buildCouplesLeaderboard } from "./couples-leaderboard";
import { coupleValueCents, danceCardV2Rule, type DanceCardWeek } from "./dance-card-v2";
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

// What publishing stores for the manager each week under v2.
function storedRosterPoints(): Map<number, number> {
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
        settings: [{ league_id: "l", dance_card_version: "v2", judges_score_starts_week: 2, judges_score_category_weight: 2, eliminations_category_weight: 1, bonus_picks_category_weight: 1 } as never],
        rosters: slots.map((s) => ({ league_id: "l", manager_id: s.managerId, couple_id: s.coupleId, start_week: s.startWeek, end_week: s.endWeek })),
        predictions: [],
        lateUnlocks: [],
        grandFinalePredictions: [],
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
      weekSchedule: weeks.map((w) => ({ weekNumber: w.weekNumber, eliminations: 1 })),
    };
    const lines = buildScoreHistory(input).filter((line) => line.module === "danceCard");
    expect(lines.map((line) => [line.weekNumber, line.label, line.points])).toEqual(
      expect.arrayContaining([
        [4, "Harry: Jdg 27 · Season 71 × 2 Wt", credit(44, 71) * 2],
        [3, "Harry: Jdg 24 · Season 44 × 2 Wt", credit(18, 44) * 2],
        [2, "Giada: Jdg 12 · Season 12 × 2 Wt", credit(0, 12) * 2],
      ])
    );
    expect(lines.some((line) => /Survival|Podium|Bonus/.test(line.label))).toBe(false);
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
      { week_id: "w4", manager_id: "m", roster_points: credit(44, 71), prediction_points: 3, grand_finale_points: 1, total_points: Math.round((credit(44, 71) * 2 + 4) * 100) / 100 },
    ]);
  });
});
