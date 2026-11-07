import { describe, expect, it } from "vitest";
import { coupleValueCents, danceCardV2Rule } from "./dance-card-v2";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";
import { buildRevealPlan } from "./episode-reveal";

const rule = danceCardV2Rule(2);
const credit = (before: number, after: number) => (coupleValueCents(after, rule) - coupleValueCents(before, rule)) / 100;

function settings(leagueId: string, version: "v1" | "v2") {
  return {
    league_id: leagueId,
    dance_card_version: version,
    judges_score_multiplier: 0.2449,
    survival_points: 1.56,
    elimination_prediction_points: 10.35,
    top_scorer_prediction_points: 6.9,
    first_place_points: 26.09,
    second_place_points: 13.04,
    third_place_points: 6.96,
    fourth_place_points: 3.48,
    fifth_place_points: 1.74,
    judges_score_category_weight: 2,
    eliminations_category_weight: 1,
    bonus_picks_category_weight: 1,
    judges_score_starts_week: 2,
    bonus_picks_scoring_method: "distance_based",
    bonus_picks_distance_penalty: 2.08,
    bonus_picks_tier_size: null,
    bonus_picks_tier_pay_style: "equal",
    bonus_picks_points_per_correct: 8.33,
    curtain_call_near_miss_enabled: true,
  };
}

const live = (id: string, episode: string, couple: string, total: number) => ({
  id, episode_id: episode, couple_id: couple, dance_style_id: "waltz", song_title: null, total_score: total, scaled_score: total, max_score: null, team_id: null,
});

// Harry danced 18 (Week 2) and 24 (Week 3), both published; Week 4 is
// drafted at 24. "flat" is a v1 league and "curve" a v2 league, each with one
// manager holding Harry.
function season(): PublicationSnapshot {
  return {
    season: { id: "s" },
    episodes: [
      { id: "e2", season_id: "s", week_id: "w2", episode_number: 2, results_published_at: "2026-09-28" },
      { id: "e3", season_id: "s", week_id: "w3", episode_number: 3, results_published_at: "2026-09-30" },
      { id: "e4", season_id: "s", week_id: "w4", episode_number: 4, results_published_at: null },
    ],
    weeks: [2, 3, 4].map((n) => ({ id: `w${n}`, season_id: "s", week_number: n, is_elimination_week: true, is_finale: false, is_double_elimination_week: false })),
    couples: [{ id: "harry", season_id: "s", status: "active", elimination_week: null }],
    dances: [live("d2", "e2", "harry", 18), live("d3", "e3", "harry", 24)],
    outcomes: [
      { episode_id: "e2", couple_id: "harry", outcome: "safe", bonus_points: 0 },
      { episode_id: "e3", couple_id: "harry", outcome: "safe", bonus_points: 0 },
    ],
    jeopardy: [],
    leagues: [{ id: "flat", roster_size: 2 }, { id: "curve", roster_size: 2 }],
    settings: [settings("flat", "v1"), settings("curve", "v2")],
    rosters: ["flat", "curve"].map((league_id) => ({ league_id, manager_id: `m-${league_id}`, slot_number: 1, couple_id: "harry", source: "draft", start_week: 1, end_week: null })),
    predictions: [],
    lateUnlocks: [],
    grandFinalePredictions: [],
    weeklyScores: [],
    laterWeeklyScores: [],
    draftOverrides: [{ episode_id: "e4" }],
    draftDances: [{ id: "dd4", episode_id: "e4", couple_id: "harry", dance_style_id: "waltz", song_title: null }],
    draftJudges: [8, 8, 8].map((score, i) => ({ draft_dance_score_id: "dd4", judge_id: `j${i}`, score })),
    draftResults: [{ episode_id: "e4", couple_id: "harry", outcome: "safe", bonus_points: 0 }],
    draftJeopardy: [],
  } as unknown as PublicationSnapshot;
}

const row = (rows: { league_id: string; roster_points: number }[], league: string) => rows.find((r) => r.league_id === league)!;

describe("Dance Card v2 publication", () => {
  it("pays a v2 league the week's credit and leaves a v1 league on the old rule", () => {
    const plan = buildPublicationPlan(season(), "e4");
    expect(plan.planVersion).toBe(4);
    expect(row(plan.weeklyScores, "curve").roster_points).toBe(credit(42, 66));
    expect(row(plan.weeklyScores, "flat").roster_points).toBe(7.44); // 24 × 0.2449 + 1.56
    expect(row(plan.weeklyScores, "curve")).toMatchObject({ total_points: credit(42, 66) * 2 });
  });

  it("puts a Fantasy Bonus inside the week's input", () => {
    const data = season();
    data.draftResults = [{ episode_id: "e4", couple_id: "harry", outcome: "safe", bonus_points: 3 }] as typeof data.draftResults;
    expect(row(buildPublicationPlan(data, "e4").weeklyScores, "curve").roster_points).toBe(credit(42, 69));
  });

  it("rewrites a v2 league's later weeks when an earlier week is corrected, keeping their picks", () => {
    const data = season();
    data.episodes = data.episodes.map((e) => (e.id === "e4" ? { ...e, results_published_at: "2026-10-07" } : e));
    data.dances = [...data.dances, live("d4", "e4", "harry", 24)] as typeof data.dances;
    data.outcomes = [...data.outcomes, { episode_id: "e4", couple_id: "harry", outcome: "safe", bonus_points: 0 }] as typeof data.outcomes;
    // Correct Week 3 from 24 to 27.
    data.draftOverrides = [{ episode_id: "e3" }] as typeof data.draftOverrides;
    data.draftDances = [{ id: "dd3", episode_id: "e3", couple_id: "harry", dance_style_id: "waltz", song_title: null }] as typeof data.draftDances;
    data.draftJudges = [9, 9, 9].map((score, i) => ({ draft_dance_score_id: "dd3", judge_id: `j${i}`, score })) as typeof data.draftJudges;
    data.draftResults = [{ episode_id: "e3", couple_id: "harry", outcome: "safe", bonus_points: 0 }] as typeof data.draftResults;
    data.laterWeeklyScores = [
      { league_id: "curve", manager_id: "m-curve", week_id: "w4", roster_points: 7.7, prediction_points: 5, grand_finale_points: 1, total_points: 21.4 },
      { league_id: "flat", manager_id: "m-flat", week_id: "w4", roster_points: 7.44, prediction_points: 5, grand_finale_points: 1, total_points: 20.88 },
    ];
    const plan = buildPublicationPlan(data, "e3");
    expect(row(plan.weeklyScores, "curve").roster_points).toBe(credit(18, 45));
    const later = credit(45, 69);
    expect(plan.laterDanceCard).toEqual([
      { league_id: "curve", manager_id: "m-curve", week_id: "w4", roster_points: later, total_points: Math.round((later * 2 + 5 + 1) * 100) / 100 },
    ]);
  });
});

describe("Dance Card v2 reveal", () => {
  it("writes a v2 league's whole-week credit, not a change on top of the stored row", () => {
    const data = season();
    data.weeklyScores = [
      { league_id: "curve", manager_id: "m-curve", week_id: "w4", roster_points: 99, prediction_points: 4, grand_finale_points: 0, total_points: 202 },
    ];
    const plan = buildRevealPlan(data, "e4", "harry", false);
    expect(row(plan.weeklyScores, "curve")).toMatchObject({ roster_points: credit(42, 66), prediction_points: 4, total_points: Math.round((credit(42, 66) * 2 + 4) * 100) / 100 });
  });

  it("counts a published sibling night's Fantasy Bonus when the second night posts", () => {
    const data = season();
    data.episodes = [...data.episodes, { id: "e4b", season_id: "s", week_id: "w4", episode_number: 5, results_published_at: null }] as typeof data.episodes;
    data.episodes = data.episodes.map((e) => (e.id === "e4" ? { ...e, results_published_at: "2026-10-07" } : e));
    data.dances = [...data.dances, live("d4", "e4", "harry", 24)] as typeof data.dances;
    data.outcomes = [...data.outcomes, { episode_id: "e4", couple_id: "harry", outcome: "safe", bonus_points: 2 }] as typeof data.outcomes;
    data.draftDances = [{ id: "dd5", episode_id: "e4b", couple_id: "harry", dance_style_id: "waltz", song_title: null }] as typeof data.draftDances;
    data.draftJudges = [10, 10, 10].map((score, i) => ({ draft_dance_score_id: "dd5", judge_id: `j${i}`, score })) as typeof data.draftJudges;
    const plan = buildRevealPlan(data, "e4b", "harry", false);
    expect(row(plan.weeklyScores, "curve").roster_points).toBe(credit(42, 42 + 24 + 2 + 30));
  });

  it("refuses while a v2 league already has a later week's scores", () => {
    const data = season();
    data.laterWeeklyScores = [
      { league_id: "curve", manager_id: "m-curve", week_id: "w4", roster_points: 1, prediction_points: 0, grand_finale_points: 0, total_points: 2 },
    ];
    data.episodes = data.episodes.map((e) => (e.id === "e4" ? { ...e, week_id: "w3" } : e));
    expect(() => buildRevealPlan(data, "e4", "harry", false)).toThrow("Week 4 already has scores. Publish weeks in order.");
  });

  it("undo returns a v2 league to the cents it had before the post", () => {
    const data = season();
    const posted = buildRevealPlan(data, "e4", "harry", false).weeklyScores;
    data.dances = [...data.dances, live("d4", "e4", "harry", 24)] as typeof data.dances;
    data.weeklyScores = posted;
    expect(row(buildRevealPlan(data, "e4", "harry", true).weeklyScores, "curve").roster_points).toBe(0);
  });
});
