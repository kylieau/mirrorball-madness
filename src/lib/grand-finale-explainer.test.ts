import { describe, expect, it } from "vitest";
import {
  defaultPointsPerCorrect,
  describeBands,
  distanceCreditTable,
  explainGrandFinaleMethod,
} from "./grand-finale-explainer";

describe("distanceCreditTable", () => {
  it("steps down by the penalty and stops at 0", () => {
    expect(distanceCreditTable(200, 50)).toEqual([
      { off: 0, points: 200 },
      { off: 1, points: 150 },
      { off: 2, points: 100 },
      { off: 3, points: 50 },
      { off: 4, points: 0 },
    ]);
  });

  it("rounds each row to two decimals", () => {
    expect(distanceCreditTable(20.7, 5.2).map((r) => r.points)).toEqual([20.7, 15.5, 10.3, 5.1, 0]);
  });

  it("floors at 0 when the penalty overshoots", () => {
    expect(distanceCreditTable(100, 70).map((r) => r.points)).toEqual([100, 30, 0]);
  });

  it("returns a single row when there is no penalty", () => {
    expect(distanceCreditTable(100, 0)).toEqual([{ off: 0, points: 100 }]);
  });
});

describe("describeBands", () => {
  it("lists bands by finishing place with a smaller last band", () => {
    expect(describeBands(12, 5, "equal")).toEqual([
      { fromPlace: 1, toPlace: 5, fraction: 1 },
      { fromPlace: 6, toPlace: 10, fraction: 1 },
      { fromPlace: 11, toPlace: 12, fraction: 1 },
    ]);
  });

  it("applies graded fractions per band", () => {
    expect(describeBands(12, 3, "graded").map((b) => b.fraction)).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it("collapses to one band when the width covers the cast", () => {
    expect(describeBands(12, 20, "equal")).toEqual([{ fromPlace: 1, toPlace: 12, fraction: 1 }]);
  });
});

describe("explainGrandFinaleMethod", () => {
  const base = { pointsPerCorrect: 200, distancePenalty: 50, tierSize: 3, tierPayStyle: "equal" as const, totalCouples: 12 };

  it("explains distance-based with worked examples and the zero point", () => {
    const text = explainGrandFinaleMethod({ ...base, method: "distance_based" });
    expect(text).toContain("1 off → 150.00");
    expect(text).toContain("down to 0.00 at 4 off");
  });

  it("shows every point value to two decimals without float noise", () => {
    const text = explainGrandFinaleMethod({
      ...base,
      method: "distance_based",
      pointsPerCorrect: 20.7,
      distancePenalty: 5.2,
    });
    expect(text).toBe(
      "Earn 20.70 pts for an exact spot, minus 5.20 for each spot you're off (exact → 20.70, 1 off → 15.50, 2 off → 10.30, 3 off → 5.10), down to 0.00 at 4 off."
    );
  });

  it("explains bands with places, not positions", () => {
    const text = explainGrandFinaleMethod({ ...base, method: "band_tier" });
    expect(text).toContain("1–3, 4–6, 7–9, 10–12");
    expect(text).toContain("Every band pays the same");
  });

  it("mentions the graded decay", () => {
    const text = explainGrandFinaleMethod({ ...base, method: "band_tier", tierPayStyle: "graded" });
    expect(text).toContain("75%, 50%, then 25%");
  });
});

describe("defaultPointsPerCorrect", () => {
  it("gives graded bands their own base", () => {
    expect(defaultPointsPerCorrect("band_tier", "graded")).not.toBe(defaultPointsPerCorrect("band_tier", "equal"));
  });
});
