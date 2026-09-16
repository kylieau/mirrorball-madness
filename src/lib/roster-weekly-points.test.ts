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
  it("tags eliminated and withdrawn couples as eliminated", () => {
    expect(deriveCoupleWeeklyTag("eliminated")).toBe("eliminated");
    expect(deriveCoupleWeeklyTag("withdrawn")).toBe("eliminated");
  });

  it("defaults to safe", () => {
    expect(deriveCoupleWeeklyTag("active")).toBe("safe");
  });
});
