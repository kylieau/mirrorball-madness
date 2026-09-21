import { describe, expect, it } from "vitest";
import { judgePointsThroughWeek, slotActiveInWeek } from "./roster-couple-points";

const base = { judgesScoreStartsWeek: 1, week: 3, multiplier: 2, categoryWeight: 1 };
const slot = (coupleId: string, startWeek: number, endWeek: number | null = null) => ({
  managerId: "m",
  coupleId,
  startWeek,
  endWeek,
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
      scores: [
        { coupleId: "a", weekNumber: 1, totalScore: 25 },
        { coupleId: "a", weekNumber: 2, totalScore: 26 },
        { coupleId: "a", weekNumber: 3, totalScore: 27 },
      ],
    });
    expect(points.get("a")).toEqual({ week: 27, total: 78 }); // 27*2*.5, (25+26+27)*2*.5
  });

  it("ignores weeks before the slot started and before Dance Card scored", () => {
    const points = judgePointsThroughWeek({
      ...base,
      judgesScoreStartsWeek: 2,
      slots: [slot("a", 1), slot("b", 3)],
      scores: [
        { coupleId: "a", weekNumber: 1, totalScore: 20 },
        { coupleId: "a", weekNumber: 2, totalScore: 20 },
        { coupleId: "b", weekNumber: 2, totalScore: 20 },
        { coupleId: "b", weekNumber: 3, totalScore: 20 },
      ],
    });
    expect(points.get("a")).toEqual({ week: 0, total: 40 });
    expect(points.get("b")).toEqual({ week: 40, total: 40 });
  });

  it("stops a closed slot at its end week and never looks past the selected week", () => {
    const points = judgePointsThroughWeek({
      ...base,
      week: 2,
      slots: [slot("a", 1, 2)],
      scores: [
        { coupleId: "a", weekNumber: 2, totalScore: 10 },
        { coupleId: "a", weekNumber: 3, totalScore: 99 },
      ],
    });
    expect(points.get("a")).toEqual({ week: 20, total: 20 });
  });
});
