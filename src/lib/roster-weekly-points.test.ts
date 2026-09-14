import { describe, expect, it } from "vitest";
import { computeCoupleWeeklyPoints, deriveCoupleWeeklyTag } from "./roster-weekly-points";

describe("computeCoupleWeeklyPoints", () => {
  it("applies the judges' score multiplier and the category weight, rounded", () => {
    expect(computeCoupleWeeklyPoints(24, 1, 1)).toBe(24);
    expect(computeCoupleWeeklyPoints(24, 1.5, 1)).toBe(36);
    expect(computeCoupleWeeklyPoints(24, 1, 1.5)).toBe(36);
    expect(computeCoupleWeeklyPoints(23, 1.1, 1)).toBe(25); // 25.3 rounds to 25
  });

  it("handles a zero score", () => {
    expect(computeCoupleWeeklyPoints(0, 1, 1)).toBe(0);
  });
});

describe("deriveCoupleWeeklyTag", () => {
  it("tags eliminated and withdrawn couples as eliminated regardless of bottom-two", () => {
    expect(deriveCoupleWeeklyTag("eliminated", false)).toBe("eliminated");
    expect(deriveCoupleWeeklyTag("withdrawn", true)).toBe("eliminated");
  });

  it("tags a still-competing couple in the bottom two", () => {
    expect(deriveCoupleWeeklyTag("active", true)).toBe("bottom_two");
  });

  it("defaults to safe", () => {
    expect(deriveCoupleWeeklyTag("active", false)).toBe("safe");
  });
});
