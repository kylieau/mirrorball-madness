import { describe, expect, it } from "vitest";
import { findTopScorerCoupleIds } from "./scoring";
import {
  buildPastPicksComparison,
  isPastPicksLocked,
  matchEliminationPicks,
  matchTopScorerPick,
  selectPastPicksEpisode,
} from "./past-picks";

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

describe("isPastPicksLocked", () => {
  it("locks any week outside the spoiler cutoff's allowed set", () => {
    const allowed = new Set(["ep-1"]);
    expect(isPastPicksLocked("ep-1", allowed)).toBe(false);
    expect(isPastPicksLocked("ep-2", allowed)).toBe(true);
  });
});

describe("matchEliminationPicks", () => {
  it("marks a single-elim hit, miss, and empty pick", () => {
    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
      })
    ).toEqual([{ pickId: "a", correct: true }]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "b",
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
      })
    ).toEqual([{ pickId: "b", correct: false }]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: null,
        predictedEliminatedCoupleId2: null,
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a"],
      })
    ).toEqual([{ pickId: null, correct: false }]);
  });

  it("scores each double-elim slot independently and ignores the second slot on a normal week", () => {
    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: "c",
        isDoubleElimination: true,
        eliminatedCoupleIds: ["a", "b"],
      })
    ).toEqual([
      { pickId: "a", correct: true },
      { pickId: "c", correct: false },
    ]);

    expect(
      matchEliminationPicks({
        predictedEliminatedCoupleId: "a",
        predictedEliminatedCoupleId2: "b",
        isDoubleElimination: false,
        eliminatedCoupleIds: ["a", "b"],
      })
    ).toEqual([{ pickId: "a", correct: true }]);
  });
});

describe("matchTopScorerPick", () => {
  it("hits when the pick is in the tied top-scorer set", () => {
    expect(matchTopScorerPick("a", ["a", "b"])).toEqual({ pickId: "a", correct: true });
    expect(matchTopScorerPick("c", ["a", "b"])).toEqual({ pickId: "c", correct: false });
    expect(matchTopScorerPick(null, ["a"])).toEqual({ pickId: null, correct: false });
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
    });

    expect(comparison.eliminationPicks[0]).toEqual({ pickId: "elim", correct: true });
    expect(comparison.topScorer).toEqual({ pickId: "top", correct: true });
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
    });

    expect(comparison.eliminationPicks.every((p) => p.correct)).toBe(true);
    expect(comparison.topScorer.correct).toBe(true);
    expect(comparison.predictionPoints).toBe(0);
  });
});
