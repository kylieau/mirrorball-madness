import { describe, expect, it } from "vitest";
import { buildRevealPlan, buildTeamRevealPlan } from "./episode-reveal";
import type { PublicationSnapshot } from "./episode-publication";

// One league, one manager holding Amber, multiplier 1, no survival points.
function snapshot(opts: {
  live: { couple_id: string; total_score: number; scaled_score: number; team_id?: string | null }[];
  teamMarks?: number[];
  stored?: number;
}): PublicationSnapshot {
  return {
    season: { id: "s" },
    episodes: [{ id: "ep", season_id: "s", week_id: "w", episode_number: 1, results_published_at: null }],
    weeks: [{ id: "w", season_id: "s", week_number: 8, is_elimination_week: true, is_finale: false, is_double_elimination_week: false }],
    couples: [{ id: "amber", season_id: "s", status: "active", elimination_week: null }, { id: "julia", season_id: "s", status: "active", elimination_week: null }],
    dances: opts.live.map((d, i) => ({ id: `l${i}`, episode_id: "ep", dance_style_id: "fs", song_title: null, team_id: null, ...d })),
    outcomes: [],
    jeopardy: [],
    leagues: [{ id: "lg", draft_status: "completed" }],
    settings: [{ league_id: "lg", judges_score_multiplier: 1, survival_points: 0, judges_score_category_enabled: true, judges_score_category_weight: 1, eliminations_category_enabled: false, eliminations_category_weight: 0, bonus_picks_category_enabled: false, bonus_picks_category_weight: 0, judges_score_starts_week: 1, first_place_points: 0, second_place_points: 0, third_place_points: 0, fourth_place_points: 0, fifth_place_points: 0, elimination_prediction_points: 0, top_scorer_prediction_points: 0, bonus_picks_points_per_correct: 0, bonus_picks_scoring_method: "exact_position", bonus_picks_distance_penalty: 0, bonus_picks_tier_size: 1, bonus_picks_tier_pay_style: "equal", curtain_call_near_miss_enabled: false }],
    rosters: [{ league_id: "lg", manager_id: "m", couple_id: "amber", slot_number: 1, start_week: 1, end_week: null, source: "draft" }],
    predictions: [],
    lateUnlocks: [],
    grandFinalePredictions: [],
    weeklyScores: opts.stored == null ? [] : [{ league_id: "lg", manager_id: "m", week_id: "w", roster_points: opts.stored, prediction_points: 0, grand_finale_points: 0, total_points: opts.stored }],
    draftOverrides: [{ episode_id: "ep" }],
    draftDances: [{ id: "d1", episode_id: "ep", couple_id: "amber", dance_style_id: "c", song_title: "Own" }],
    draftJudges: [8, 8, 9, 8].map((score, i) => ({ draft_dance_score_id: "d1", judge_id: `j${i}`, score })),
    draftResults: [{ episode_id: "ep", couple_id: "amber", outcome: "safe" }, { episode_id: "ep", couple_id: "julia", outcome: "safe" }],
    draftJeopardy: [],
    participants: [],
    teams: [{ id: "t", episode_id: "ep", name: "Slaytopia", song_title: "Zoo", dance_style_id: "fs", captain_couple_id: null, host_name: null, sort_order: 1, posted_at: null }],
    teamMembers: [{ team_id: "t", episode_id: "ep", couple_id: "amber" }, { team_id: "t", episode_id: "ep", couple_id: "julia" }],
    teamMarks: (opts.teamMarks ?? []).map((score, i) => ({ team_id: "t", judge_id: `j${i}`, score })),
  } as unknown as PublicationSnapshot;
}

describe("buildTeamRevealPlan", () => {
  it("adds the team's rows for eligible members and recomputes the night", () => {
    // Amber's own 33/40 is live (24.75 basis); the team's 36/40 makes it 69/80 → 25.875.
    const plan = buildTeamRevealPlan(snapshot({ live: [{ couple_id: "amber", total_score: 33, scaled_score: 24.75 }], teamMarks: [9, 9, 9, 9], stored: 24.75 }), "ep", "t", false);
    expect(plan.weeklyScores).toEqual([expect.objectContaining({ manager_id: "m", roster_points: 25.88, total_points: 25.88 })]);
  });

  it("refuses to post a team with fewer than four marks", () => {
    expect(() => buildTeamRevealPlan(snapshot({ live: [], teamMarks: [9, 9, 9] }), "ep", "t", false)).toThrow(/Team Slaytopia has 3 of four marks/);
  });

  it("removes only the team's rows on undo and rewrites them in place on re-post", () => {
    const live = [
      { couple_id: "amber", total_score: 33, scaled_score: 24.75 },
      { couple_id: "amber", total_score: 36, scaled_score: 27, team_id: "t" },
    ];
    const undo = buildTeamRevealPlan(snapshot({ live, teamMarks: [9, 9, 9, 9], stored: 25.88 }), "ep", "t", true);
    expect(undo.weeklyScores[0].roster_points).toBe(24.75);
    const repost = buildTeamRevealPlan(snapshot({ live, teamMarks: [10, 10, 10, 10], stored: 25.88 }), "ep", "t", false);
    expect(repost.weeklyScores[0].roster_points).toBe(27.38); // (33 + 40) / 80 × 30.
  });

  it("rejects a team that is not on this episode", () => {
    expect(() => buildTeamRevealPlan(snapshot({ live: [], teamMarks: [9, 9, 9, 9] }), "ep", "other", false)).toThrow(/no longer on this episode/);
  });
});

describe("buildRevealPlan with team rows", () => {
  it("leaves the team's row in place when a couple's own dance is un-posted", () => {
    const live = [
      { couple_id: "amber", total_score: 33, scaled_score: 24.75 },
      { couple_id: "amber", total_score: 36, scaled_score: 27, team_id: "t" },
    ];
    const plan = buildRevealPlan(snapshot({ live, teamMarks: [9, 9, 9, 9], stored: 25.88 }), "ep", "amber", true);
    expect(plan.weeklyScores[0].roster_points).toBe(27); // Team row alone: 36/40 on the 30 basis.
  });

  it("does not treat a couple with only a team row as already posted", () => {
    const live = [{ couple_id: "amber", total_score: 36, scaled_score: 27, team_id: "t" }];
    const plan = buildRevealPlan(snapshot({ live, teamMarks: [9, 9, 9, 9], stored: 27 }), "ep", "amber", false);
    expect(plan.weeklyScores[0].roster_points).toBe(25.88); // Own 33 + team 36 over 80.
  });
});
