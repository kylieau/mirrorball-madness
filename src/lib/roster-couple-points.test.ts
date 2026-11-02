import { describe, expect, it } from "vitest";
import { judgePointsThroughWeek, slotActiveInWeek } from "./roster-couple-points";

const base = { judgesScoreStartsWeek: 1, week: 3, multiplier: 2, categoryWeight: 1 };
const slot = (coupleId: string, startWeek: number, endWeek: number | null = null) => ({
  managerId: "m",
  coupleId,
  startWeek,
  endWeek,
});
// One three-judge dance per week unless an episode id is given, so the
// stored scaled score equals the raw total.
const score = (coupleId: string, weekNumber: number, scaledScore: number, episodeId = `ep${weekNumber}`) => ({
  episodeId,
  coupleId,
  weekNumber,
  totalScore: scaledScore,
  scaledScore,
});

describe("slotActiveInWeek", () => {
  it("covers start through end inclusive, open-ended when end is null", () => {
    expect(slotActiveInWeek(slot("a", 2, 4), 1)).toBe(false);
    expect(slotActiveInWeek(slot("a", 2, 4), 2)).toBe(true);
    expect(slotActiveInWeek(slot("a", 2, 4), 4)).toBe(true);
    expect(slotActiveInWeek(slot("a", 2, 4), 5)).toBe(false);
    expect(slotActiveInWeek(slot("a", 2), 9)).toBe(true);
  });
});

describe("judgePointsThroughWeek", () => {
  it("gives this week's points and a running total, scaled once and rounded once", () => {
    const points = judgePointsThroughWeek({
      ...base,
      categoryWeight: 0.5,
      slots: [slot("a", 1)],
      scores: [score("a", 1, 25), score("a", 2, 26), score("a", 3, 27)],
    });
    expect(points.get("a")).toEqual({ week: 27, total: 78 }); // 27*2*.5, (25+26+27)*2*.5
  });

  it("ignores weeks before the slot started and before Dance Card scored", () => {
    const points = judgePointsThroughWeek({
      ...base,
      judgesScoreStartsWeek: 2,
      slots: [slot("a", 1), slot("b", 3)],
      scores: [score("a", 1, 20), score("a", 2, 20), score("b", 2, 20), score("b", 3, 20)],
    });
    expect(points.get("a")).toEqual({ week: 0, total: 40 });
    expect(points.get("b")).toEqual({ week: 40, total: 40 });
  });

  it("stops a closed slot at its end week and never looks past the selected week", () => {
    const points = judgePointsThroughWeek({
      ...base,
      week: 2,
      slots: [slot("a", 1, 2)],
      scores: [score("a", 2, 10), score("a", 3, 99)],
    });
    expect(points.get("a")).toEqual({ week: 20, total: 20 });
  });

  it("pays a two-dance night once, on the combined marks, and a two-night week per night", () => {
    const points = judgePointsThroughWeek({
      ...base,
      multiplier: 1,
      slots: [slot("a", 1)],
      scores: [
        // Week 2: two nights, one dance each — each night pays on its own.
        score("a", 2, 24, "ep2a"),
        score("a", 2, 27, "ep2b"),
        // Week 3: one night, 28/40 then 36/40 — 64/80 → 24, not 21 + 27.
        { episodeId: "ep3", coupleId: "a", weekNumber: 3, totalScore: 28, scaledScore: 21 },
        { episodeId: "ep3", coupleId: "a", weekNumber: 3, totalScore: 36, scaledScore: 27 },
      ],
    });
    expect(points.get("a")).toEqual({ week: 24, total: 24 + 27 + 24 });
  });
});
