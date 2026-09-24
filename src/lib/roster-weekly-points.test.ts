import { describe, expect, it } from "vitest";
import {
  clampRosterCoupleForWeek,
  computeCoupleWeeklyPoints,
  deriveCoupleWeeklyTag,
  weeklyBonusPoints,
} from "./roster-weekly-points";

describe("computeCoupleWeeklyPoints", () => {
  it("applies the judges' score multiplier and the category weight, to two decimals", () => {
    expect(computeCoupleWeeklyPoints(24, 1, 1)).toBe(24);
    expect(computeCoupleWeeklyPoints(24, 1.5, 1)).toBe(36);
    expect(computeCoupleWeeklyPoints(24, 1, 1.5)).toBe(36);
    expect(computeCoupleWeeklyPoints(23, 1.1, 1)).toBe(25.3);
    expect(computeCoupleWeeklyPoints(23, 1.111, 1)).toBe(25.55); // 25.553 rounds to 25.55
  });

  it("handles a zero score", () => {
    expect(computeCoupleWeeklyPoints(0, 1, 1)).toBe(0);
  });
});

describe("deriveCoupleWeeklyTag", () => {
  it("tags eliminated and withdrawn couples as eliminated", () => {
    expect(deriveCoupleWeeklyTag("eliminated")).toBe("eliminated");
    expect(deriveCoupleWeeklyTag("withdrawn")).toBe("eliminated");
  });

  it("defaults to safe", () => {
    expect(deriveCoupleWeeklyTag("active")).toBe("safe");
  });
});

describe("clampRosterCoupleForWeek", () => {
  const goneWeek3 = { status: "eliminated", eliminationWeek: 3 };

  it("zeros later-week points once the elim is revealed", () => {
    expect(
      clampRosterCoupleForWeek(goneWeek3, {
        cutoffWeek: 5,
        finaleWeekNumber: null,
        weekNumber: 5,
        rawWeeklyPoints: 24,
      })
    ).toEqual({ tag: "eliminated", weeklyPoints: 0 });
  });

  it("keeps the going-home week's points", () => {
    expect(
      clampRosterCoupleForWeek(goneWeek3, {
        cutoffWeek: 3,
        finaleWeekNumber: null,
        weekNumber: 3,
        rawWeeklyPoints: 24,
      })
    ).toEqual({ tag: "eliminated", weeklyPoints: 24 });
  });

  it("looks like an ordinary roster couple before the elim week is revealed", () => {
    expect(
      clampRosterCoupleForWeek(goneWeek3, {
        cutoffWeek: 2,
        finaleWeekNumber: null,
        weekNumber: 2,
        rawWeeklyPoints: 20,
      })
    ).toEqual({ tag: "safe", weeklyPoints: 20 });
  });

  it("leaves a still-competing couple's tag and points alone", () => {
    expect(
      clampRosterCoupleForWeek(
        { status: "active", eliminationWeek: null },
        {
          cutoffWeek: 5,
          finaleWeekNumber: null,
          weekNumber: 5,
          rawWeeklyPoints: 22,
        }
      )
    ).toEqual({ tag: "safe", weeklyPoints: 22 });
  });
});

describe("weeklyBonusPoints", () => {
  it("is the weighted week total minus the couples' judges' points", () => {
    // 9.31 raw roster points x2 weight = 18.62; couples' judges' points 6.80 + 5.82
    expect(weeklyBonusPoints(9.31, 2, [6.8, 5.82])).toBe(6);
  });

  it("is zero when nothing beyond judges' points was earned, and never negative", () => {
    expect(weeklyBonusPoints(0, 2, [])).toBe(0);
    expect(weeklyBonusPoints(1, 1, [3])).toBe(0);
  });
});
