import { describe, expect, it } from "vitest";
import { findTopScorerCoupleIds } from "./scoring";
import {
  buildCurtainCallWeeks,
  buildPastPicksComparison,
  collapsePickRows,
  isPastPicksLocked,
  matchEliminationPicks,
  matchTopScorerPick,
  selectCurtainCallWeek,
  selectPastPicksEpisode,
  type PickMatch,
} from "./past-picks";

function exactPick(pickId: string, points = 20): PickMatch {
  return { pickId, verdict: "exact", points };
}
function missPick(pickId: string | null): PickMatch {
  return { pickId, verdict: "miss", points: 0 };
}

const e01 = { id: "ep-1", week_number: 1 };
const e02 = { id: "ep-2", week_number: 2 };
const e03 = { id: "ep-3", week_number: 3 };
const completedDesc = [e03, e02, e01];

describe("findTopScorerCoupleIds", () => {
  it("sums multiple dances for the same couple, matching computeWeeklyScores", () => {
    expect(
      findTopScorerCoupleIds([
        { coupleId: "a", totalScore: 24 },
        { coupleId: "a", totalScore: 27 },
        { coupleId: "b", totalScore: 40 },
      ])
    ).toEqual(new Set(["a"]));
  });

  it("treats a tie as every couple on the high score", () => {
    expect(
      findTopScorerCoupleIds([
        { coupleId: "a", totalScore: 30 },
        { coupleId: "b", totalScore: 30 },
        { coupleId: "c", totalScore: 18 },
      ])
    ).toEqual(new Set(["a", "b"]));
  });

  it("has no top scorer when nothing scored above 0", () => {
    expect(findTopScorerCoupleIds([])).toEqual(new Set());
    expect(findTopScorerCoupleIds([{ coupleId: "a", totalScore: 0 }])).toEqual(new Set());
  });
});

describe("selectPastPicksEpisode", () => {
  const allowed = new Set(["ep-1", "ep-2"]);

  it("returns null when nothing has completed yet", () => {
    expect(selectPastPicksEpisode([], allowed, "ep-1")).toBeNull();
  });

  it("honors a completed week param, including a locked unwatched week", () => {
    expect(selectPastPicksEpisode(completedDesc, allowed, "ep-3")).toEqual(e03);
    expect(selectPastPicksEpisode(completedDesc, allowed, "ep-1")).toEqual(e01);
  });

  it("falls back to the latest visible week when the param is missing or unknown", () => {
    expect(selectPastPicksEpisode(completedDesc, allowed, null)).toEqual(e02);
    expect(selectPastPicksEpisode(completedDesc, allowed, "nope")).toEqual(e02);
  });

  it("falls back to the latest completed week when none are visible yet", () => {
    expect(selectPastPicksEpisode(completedDesc, new Set(), null)).toEqual(e03);
  });
});

describe("selectCurtainCallWeek", () => {
  const allowed = new Set(["ep-1", "ep-2"]);
  const live = { id: "ep-4", week_number: 4 };

  it("defaults to the live week so Your Picks opens on the pick form", () => {
    expect(selectCurtainCallWeek(completedDesc, live, allowed, null)).toEqual({
      episode: live,
      mode: "picks",
    });
  });

  it("honors a live week param", () => {
    expect(selectCurtainCallWeek(completedDesc, live, allowed, "ep-4")).toEqual({
      episode: live,
      mode: "picks",
    });
  });

  it("honors a completed week param, including an unwatched week", () => {
    expect(selectCurtainCallWeek(completedDesc, live, allowed, "ep-1")).toEqual({
      episode: e01,
      mode: "recap",
    });
    expect(selectCurtainCallWeek(completedDesc, live, allowed, "ep-3")).toEqual({
      episode: e03,
      mode: "recap",
    });
  });

  it("falls back to the live week when the param is unknown", () => {
    expect(selectCurtainCallWeek(completedDesc, live, allowed, "nope")).toEqual({
      episode: live,
      mode: "picks",
    });
  });

  it("falls back to the latest visible completed week when there is no live week", () => {
    expect(selectCurtainCallWeek(completedDesc, null, allowed, null)).toEqual({
      episode: e02,
      mode: "recap",
    });
  });

  it("is empty when the season has no live or completed weeks", () => {
    expect(selectCurtainCallWeek([], null, allowed, null)).toEqual({ episode: null, mode: null });
  });
});

describe("buildCurtainCallWeeks", () => {
  it("appends the live week after completed weeks, sorted by week number", () => {
    const completed = [
      { id: "ep-2", weekNumber: 2 },
      { id: "ep-1", weekNumber: 1 },
    ];
    const live = { id: "ep-3", weekNumber: 3 };
    expect(buildCurtainCallWeeks(completed, live).map((w) => w.id)).toEqual(["ep-1", "ep-2", "ep-3"]);
  });

  it("does not duplicate a live week that is already in the completed list", () => {
    const weeks = [{ id: "ep-1", weekNumber: 1 }];
    expect(buildCurtainCallWeeks(weeks, weeks[0]).map((w) => w.id)).toEqual(["ep-1"]);
  });
});

describe("isPastPicksLocked", () => {
  it("locks any week outside the spoiler cutoff's allowed set", () => {
    const allowed = new Set(["ep-1"]);
    expect(isPastPicksLocked("ep-1", allowed)).toBe(false);
    expect(isPastPicksLocked("ep-2", allowed)).toBe(true);
  });
});

const payout = { exactPayout: 20, nearMissEnabled: true };

describe("matchEliminationPicks", () => {
  it("marks a single-elim hit, miss, and empty pick", () => {
    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
        ...payout,
      })
    ).toEqual([{ pickId: "a", verdict: "exact", points: 20 }]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "b",
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
        ...payout,
      })
    ).toEqual([{ pickId: "b", verdict: "miss", points: 0 }]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: null,
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
        ...payout,
      })
    ).toEqual([{ pickId: null, verdict: "miss", points: 0 }]);
  });

  it("scores each double-elim slot independently and ignores the second slot on a normal week", () => {
    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: "c",
        isDoubleElimination: true,
        eliminatedCoupleIds: ["a", "b"],
        inJeopardyCoupleIds: ["c"],
        ...payout,
      })
    ).toEqual([
      { pickId: "a", verdict: "exact", points: 20 },
      { pickId: "c", verdict: "near_miss", points: 5 },
    ]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: "b",
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a", "b"],
        inJeopardyCoupleIds: ["b"],
        ...payout,
      })
    ).toEqual([{ pickId: "a", verdict: "exact", points: 20 }]);
  });

  it("does not award In Jeopardy when the league has it off", () => {
    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "c",
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
        inJeopardyCoupleIds: ["c"],
        exactPayout: 20,
        nearMissEnabled: false,
      })
    ).toEqual([{ pickId: "c", verdict: "miss", points: 0 }]);
  });
});

describe("matchTopScorerPick", () => {
  const dances = [
    { coupleId: "a", totalScore: 30 },
    { coupleId: "b", totalScore: 30 },
    { coupleId: "c", totalScore: 29 },
  ];

  it("hits when the pick is in the tied top-scorer set, and near-misses within 1", () => {
    expect(
      matchTopScorerPick({
        predictedTopScorerCoupleId: "a",
        danceScores: dances,
        ...payout,
      })
    ).toEqual({ pickId: "a", verdict: "exact", points: 20 });
    expect(
      matchTopScorerPick({
        predictedTopScorerCoupleId: "c",
        danceScores: dances,
        ...payout,
      })
    ).toEqual({ pickId: "c", verdict: "near_miss", points: 5 });
    expect(
      matchTopScorerPick({
        predictedTopScorerCoupleId: null,
        danceScores: dances,
        ...payout,
      })
    ).toEqual({ pickId: null, verdict: "miss", points: 0 });
  });
});

describe("collapsePickRows", () => {
  it("collapses a hit into a single Nailed it row, without a duplicate Actual", () => {
    expect(collapsePickRows([exactPick("a")], ["a"])).toEqual([{ kind: "nailed", coupleIds: ["a"] }]);
  });

  it("puts a miss on one strike→actual line, not a stacked Actual row", () => {
    expect(collapsePickRows([missPick("b")], ["a"])).toEqual([
      { kind: "miss", pickIds: ["b"], actualIds: ["a"] },
    ]);
    expect(collapsePickRows([missPick(null)], ["a"])).toEqual([
      { kind: "miss", pickIds: [], actualIds: ["a"] },
    ]);
  });

  it("shows an In Jeopardy guess with its floored points, still naming who went home", () => {
    expect(
      collapsePickRows(
        [
          exactPick("a"),
          { pickId: "c", verdict: "near_miss", points: 5 },
        ],
        ["a", "b"]
      )
    ).toEqual([
      { kind: "nailed", coupleIds: ["a"] },
      { kind: "in_jeopardy", pickIds: ["c"], actualIds: ["b"], points: 5 },
    ]);

    expect(
      collapsePickRows(
        [
          { pickId: "c", verdict: "near_miss", points: 5 },
          { pickId: "d", verdict: "near_miss", points: 5 },
        ],
        ["a", "b"]
      )
    ).toEqual([
      { kind: "in_jeopardy", pickIds: ["c"], actualIds: ["a"], points: 5 },
      { kind: "in_jeopardy", pickIds: ["d"], actualIds: ["b"], points: 5 },
    ]);
  });

  it("collapses each double-elim slot independently, in slot order", () => {
    expect(collapsePickRows([exactPick("a"), exactPick("b")], ["a", "b"])).toEqual([
      { kind: "nailed", coupleIds: ["a"] },
      { kind: "nailed", coupleIds: ["b"] },
    ]);

    expect(collapsePickRows([exactPick("a"), missPick("c")], ["a", "b"])).toEqual([
      { kind: "nailed", coupleIds: ["a"] },
      { kind: "miss", pickIds: ["c"], actualIds: ["b"] },
    ]);

    expect(collapsePickRows([missPick("c"), missPick("d")], ["a", "b"])).toEqual([
      { kind: "miss", pickIds: ["c"], actualIds: ["a"] },
      { kind: "miss", pickIds: ["d"], actualIds: ["b"] },
    ]);

    expect(collapsePickRows([exactPick("a"), exactPick("a")], ["a", "b"])).toEqual([
      { kind: "nailed", coupleIds: ["a"] },
    ]);
  });

  it("on a top-scorer hit, does not also list tied partners as Actual", () => {
    expect(collapsePickRows([exactPick("a")], ["a", "b"])).toEqual([{ kind: "nailed", coupleIds: ["a"] }]);
  });

  it("on a miss, lists every actual including ties on that same line", () => {
    expect(collapsePickRows([missPick("c")], ["a", "b"])).toEqual([
      { kind: "miss", pickIds: ["c"], actualIds: ["a", "b"] },
    ]);
  });
});

describe("buildPastPicksComparison", () => {
  it("uses stored prediction points rather than recomputing a score", () => {
    const comparison = buildPastPicksComparison({
      isDoubleElimination: false,
      predictedEliminatedCoupleId: "elim",
      predictedEliminatedCoupleId2: null,
      predictedTopScorerCoupleId: "top",
      episodeOutcomes: [
        { coupleId: "elim", outcome: "eliminated" },
        { coupleId: "top", outcome: "safe" },
      ],
      danceScores: [
        { coupleId: "top", totalScore: 30 },
        { coupleId: "elim", totalScore: 18 },
      ],
      predictionPoints: 50,
      nearMissEnabled: true,
      eliminationExactPayout: 20,
      topScorerExactPayout: 15,
    });

    expect(comparison.eliminationPicks[0]).toEqual({ pickId: "elim", verdict: "exact", points: 20 });
    expect(comparison.topScorer).toEqual({ pickId: "top", verdict: "exact", points: 15 });
    expect(comparison.actualEliminatedIds).toEqual(["elim"]);
    expect(comparison.actualTopScorerIds).toEqual(["top"]);
    expect(comparison.predictionPoints).toBe(50);
  });

  it("treats a missing weekly_manager_scores row as 0 points, not a second scoring pass", () => {
    const comparison = buildPastPicksComparison({
      isDoubleElimination: true,
      predictedEliminatedCoupleId: "a",
      predictedEliminatedCoupleId2: "b",
      predictedTopScorerCoupleId: "c",
      episodeOutcomes: [
        { coupleId: "a", outcome: "eliminated" },
        { coupleId: "b", outcome: "eliminated" },
      ],
      danceScores: [{ coupleId: "c", totalScore: 27 }],
      predictionPoints: null,
      nearMissEnabled: true,
      eliminationExactPayout: 20,
      topScorerExactPayout: 15,
    });

    expect(comparison.eliminationPicks.every((p) => p.verdict === "exact")).toBe(true);
    expect(comparison.topScorer.verdict).toBe("exact");
    expect(comparison.predictionPoints).toBe(0);
  });
});
