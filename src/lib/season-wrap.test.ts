import { describe, expect, it } from "vitest";
import { bestWeek, eliminationPicksCalled, finalPlacements, finaleStillAiring, gradedBracket, placeByPoints, seasonChampions, seasonEliminationOrder } from "./season-wrap";

describe("finalPlacements", () => {
  it("orders the podium and Finish Week's 4th and 5th", () => {
    expect(finalPlacements([
      { couple_id: "ezra", outcome: "winner" },
      { couple_id: "maura", outcome: "eliminated", final_place: 5 },
      { couple_id: "amber", outcome: "runner_up" },
      { couple_id: "tatyana", outcome: "eliminated", final_place: 4 },
      { couple_id: "connor", outcome: "third_place" },
    ])).toEqual([
      { coupleId: "ezra", place: 1 }, { coupleId: "amber", place: 2 }, { coupleId: "connor", place: 3 },
      { coupleId: "tatyana", place: 4 }, { coupleId: "maura", place: 5 },
    ]);
  });

  it("counts a finalist with no place as 4th, leaves out a withdrawal, and waits for a winner", () => {
    expect(finalPlacements([{ couple_id: "w", outcome: "winner" }, { couple_id: "a", outcome: "eliminated" }, { couple_id: "b", outcome: "withdrawn" }]))
      .toEqual([{ coupleId: "w", place: 1 }, { coupleId: "a", place: 4 }]);
    expect(finalPlacements([{ couple_id: "a", outcome: "eliminated", final_place: 4 }])).toEqual([]);
  });
});

describe("seasonEliminationOrder", () => {
  it("lists each week before the Finale, newest first, with nobody out kept", () => {
    const couples = [
      { id: "a", status: "eliminated", elimination_week: 1 },
      { id: "b", status: "withdrawn", elimination_week: 3 },
      { id: "c", status: "eliminated", elimination_week: 3 },
      { id: "f", status: "eliminated", elimination_week: 4 },
      { id: "w", status: "winner", elimination_week: null },
    ];
    expect(seasonEliminationOrder(couples, 4)).toEqual([
      { weekNumber: 3, coupleIds: ["b", "c"] },
      { weekNumber: 2, coupleIds: [] },
      { weekNumber: 1, coupleIds: ["a"] },
    ]);
  });
});

describe("season recap figures", () => {
  it("finds the best week, earlier week on a tie", () => {
    expect(bestWeek([{ weekNumber: 3, points: 40 }, { weekNumber: 6, points: 112.4 }, { weekNumber: 8, points: 112.4 }])).toEqual({ weekNumber: 6, points: 112.4 });
    expect(bestWeek([])).toBeNull();
  });

  it("counts weeks a Home pick went home, a double's second pick included, skipping weeks with no pick or no result", () => {
    const out = new Map([[1, new Set(["a"])], [2, new Set(["b", "c"])], [3, new Set(["d"])]]);
    expect(eliminationPicksCalled([
      { weekNumber: 1, coupleIds: ["a"] },
      { weekNumber: 2, coupleIds: ["x", "c"] },
      { weekNumber: 3, coupleIds: ["x"] },
      { weekNumber: 4, coupleIds: ["y"] },
      { weekNumber: 5, coupleIds: [] },
    ], out)).toEqual({ called: 2, weeks: 3 });
  });

  it("grades a bracket against the real finishers", () => {
    expect(gradedBracket([{ coupleId: "e", place: 1 }, { coupleId: "a", place: 2 }], new Map([["e", 3]]))).toEqual([
      { coupleId: "e", place: 1, predictedPlace: 3 },
      { coupleId: "a", place: 2, predictedPlace: null },
    ]);
  });

  it("names the podium only once a winner is visible", () => {
    expect(seasonChampions([{ status: "winner", name: "Ezra & Daniella" }, { status: "third_place", name: "Connor & Rylee" }]))
      .toEqual({ winner: "Ezra & Daniella", runnerUp: null, third: "Connor & Rylee" });
    expect(seasonChampions([{ status: "active", name: "Ezra & Daniella" }])).toBeNull();
  });
});

describe("places and the West feed", () => {
  it("shares a place between equal totals", () => {
    const all = [880.2, 880.2, 731.52, 600];
    expect([placeByPoints(880.2, all), placeByPoints(731.52, all), placeByPoints(600, all)]).toEqual([1, 3, 4]);
  });

  it("holds the wrap from the Finale's East curtain until 10pm PT", () => {
    const weeks = [{ is_finale: true, episodes: [{ airs_at: "2026-11-25T01:00:00Z" }] }, { is_finale: false, episodes: [{ airs_at: "2026-11-18T01:00:00Z" }] }];
    expect(finaleStillAiring(weeks, new Date("2026-11-25T05:30:00Z"))).toBe(true);
    expect(finaleStillAiring(weeks, new Date("2026-11-25T06:30:00Z"))).toBe(false);
  });
});
