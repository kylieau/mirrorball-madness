import { describe, expect, it } from "vitest";
import { buildWeeklyScoreRows, seasonFinaleWeek, type WeekScoringData } from "./weekly-score-rows";

const week = (n: number, isFinale = false) => ({ week_number: n, is_finale: isFinale });

describe("seasonFinaleWeek", () => {
  it("is the week marked Finale on Schedule, even when later weeks exist", () => {
    expect(seasonFinaleWeek([week(1), week(2), week(3, true), week(4)])).toBe(3);
  });

  it("falls back to the season's last week while none is marked", () => {
    expect(seasonFinaleWeek([week(1), week(2), week(4)])).toBe(4);
    expect(seasonFinaleWeek([])).toBe(0);
  });
});

// Six couples; Ana goes home in Week 1 and one manager had her winning
// (spot 6). Distance scoring: 8 for exact, 2 lost per week off.
function weekOne(weeks: { week_number: number; is_finale: boolean }[]): WeekScoringData {
  return {
    episodes: [{ id: "e1", episode_number: 1 }],
    dances: [],
    outcomes: [],
    jeopardy: [],
    couples: ["ana", "b", "c", "d", "e", "f"].map((id) => ({
      id,
      status: id === "ana" ? "eliminated" : "active",
      elimination_week: id === "ana" ? 1 : null,
    })),
    leagues: [{ id: "league" }],
    settings: [
      {
        league_id: "league",
        dance_card_version: "v1",
        judges_score_starts_week: 1,
        judges_score_category_weight: 1,
        eliminations_category_weight: 1,
        bonus_picks_category_weight: 1,
        bonus_picks_scoring_method: "distance_based",
        bonus_picks_distance_penalty: 2,
        bonus_picks_tier_size: null,
        bonus_picks_tier_pay_style: "equal",
        bonus_picks_points_per_correct: 8,
      },
    ],
    rosters: [],
    predictions: [],
    lateUnlocks: [],
    grandFinalePredictions: [{ league_id: "league", manager_id: "m", couple_id: "ana", predicted_position: 6 }],
    finaleWeekNumber: seasonFinaleWeek(weeks),
  } as unknown as WeekScoringData;
}

const grandFinalePoints = (weeks: { week_number: number; is_finale: boolean }[]) =>
  buildWeeklyScoreRows(
    weekOne(weeks),
    { id: "w1", week_number: 1, is_double_elimination_week: false },
    "e1",
    [{ couple_id: "ana", outcome: "eliminated", bonus_points: 0 }]
  ).find((row) => row.manager_id === "m")?.grand_finale_points;

describe("Grand Finale distance follows the week marked Finale", () => {
  it("counts the weeks to the marked Finale, not to the last week on the schedule", () => {
    // Finale in Week 5: spot 6 is Week 5, four weeks after Week 1.
    expect(grandFinalePoints([1, 2, 3, 4, 5].map((n) => week(n, n === 5)))).toBe(0);
    // Finale in Week 3, with two more weeks scheduled: two weeks off.
    expect(grandFinalePoints([1, 2, 3, 4, 5].map((n) => week(n, n === 3)))).toBe(4);
  });

  it("uses the last scheduled week while no Finale is marked", () => {
    expect(grandFinalePoints([1, 2, 3, 4].map((n) => week(n)))).toBe(2);
  });
});
