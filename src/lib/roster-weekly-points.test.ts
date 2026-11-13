import { describe, expect, it } from "vitest";
import {
  clampRosterCoupleForWeek,
  computeCoupleWeeklyPoints,
  deriveCoupleWeeklyTag,
  weeklyBonusPoints,
 formerCoupleNote, holdingWeeksLabel } from "./roster-weekly-points";

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

describe("holdingWeeksLabel", () => {
  it("names an open holding, a range, one week, and a couple held twice", () => {
    expect(holdingWeeksLabel([{ from: 10, to: null }])).toBe("from Week 10");
    expect(holdingWeeksLabel([{ from: 8, to: 9 }])).toBe("Weeks 8–9");
    expect(holdingWeeksLabel([{ from: 9, to: 9 }])).toBe("Week 9");
    expect(holdingWeeksLabel([{ from: 2, to: 3 }, { from: 6, to: null }])).toBe("Weeks 2–3, from 6");
  });
});

describe("formerCoupleNote", () => {
  const periods = [{ from: 8, to: 9 }];
  it("says traded when the period after theirs began by trade, and names the holder now", () => {
    expect(formerCoupleNote({ periods, next: { source: "trade" }, holderNow: { name: "Pat" }, status: "active" })).toEqual({
      tag: "traded",
      weeks: "Weeks 8–9",
      note: "now with Pat",
    });
  });
  it("says eliminated once the couple has gone home, naming nobody", () => {
    expect(formerCoupleNote({ periods, next: { source: "waiver" }, holderNow: { name: "Pat" }, status: "eliminated" })).toEqual({
      tag: "eliminated",
      weeks: "Weeks 8–9",
      note: null,
    });
  });
  it("says dropped otherwise, naming the holder now when there is one", () => {
    expect(formerCoupleNote({ periods, next: { source: "waiver" }, holderNow: { name: "Pat" }, status: "active" })).toEqual({
      tag: "dropped",
      weeks: "Weeks 8–9",
      note: "now with Pat",
    });
    expect(formerCoupleNote({ periods, next: null, holderNow: null, status: "active" })).toMatchObject({ tag: "dropped", note: null });
    // Kim dropped them; Pat claimed and later traded them on: still a drop for Kim.
    expect(formerCoupleNote({ periods, next: { source: "waiver" }, holderNow: { name: "Lou" }, status: "active" })).toMatchObject({ tag: "dropped", note: "now with Lou" });
  });
});
