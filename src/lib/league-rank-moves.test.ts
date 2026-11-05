import { describe, expect, it } from "vitest";
import { weeklyRankMoves } from "@/lib/league-rank-moves";

const week = (weekNumber: number, points: Record<string, number>) => ({ weekNumber, points: new Map(Object.entries(points)) });

describe("weeklyRankMoves", () => {
  it("adds nothing for a first scoring week from a 0–0 tie", () => {
    expect(weeklyRankMoves(["a", "b", "c"], [week(1, { a: 0, b: 0, c: 0 }), week(2, { a: 10, b: 20, c: 5 })])).toEqual([]);
  });

  it("names everyone passed, best-placed first, with the new place", () => {
    const moves = weeklyRankMoves(["a", "b", "c", "d"], [
      week(2, { a: 40, b: 30, c: 20, d: 10 }),
      week(3, { a: 0, b: 0, c: 0, d: 50 }),
    ]);
    expect(moves).toEqual([{ weekNumber: 3, managerId: "d", passedIds: ["a", "b", "c"], place: 1 }]);
  });

  it("does not count moving into or out of a tie", () => {
    expect(weeklyRankMoves(["a", "b"], [week(2, { a: 20, b: 10 }), week(3, { a: 0, b: 10 })])).toEqual([]);
    expect(weeklyRankMoves(["a", "b"], [week(2, { a: 10, b: 10 }), week(3, { a: 0, b: 5 })])).toEqual([]);
  });

  it("shows only net movement within a week and sorts weeks", () => {
    const moves = weeklyRankMoves(["a", "b", "c"], [
      week(4, { a: 0, b: 30, c: 0 }),
      week(3, { a: 30, b: 20, c: 10 }),
    ]);
    expect(moves).toEqual([{ weekNumber: 4, managerId: "b", passedIds: ["a"], place: 1 }]);
  });

  it("gives a shared place when the mover ends level with someone else", () => {
    const moves = weeklyRankMoves(["a", "b", "c"], [week(2, { a: 30, b: 20, c: 10 }), week(3, { a: 0, b: 0, c: 20 })]);
    expect(moves).toEqual([{ weekNumber: 3, managerId: "c", passedIds: ["b"], place: 1 }]);
  });
});
