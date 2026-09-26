import { describe, expect, it } from "vitest";
import {
  eligibleGrandFinalePredictions,
  formatLateFactor,
  lateEntryLabel,
  lateEntryNote,
  latePenaltySuffix,
  lateUnlockWarning,
  parseLateFactor,
  resolvedCoupleCount,
  scaleGrandFinaleLateFactors,
} from "./grand-finale-late";

describe("parseLateFactor", () => {
  it("accepts 0 through 1 with up to two decimals", () => {
    expect(parseLateFactor("1")).toBe(1);
    expect(parseLateFactor("1.0")).toBe(1);
    expect(parseLateFactor("0")).toBe(0);
    expect(parseLateFactor("0.50")).toBe(0.5);
    expect(parseLateFactor(" 0.25 ")).toBe(0.25);
  });

  it("rejects values outside 0 to 1 and extra precision", () => {
    expect(parseLateFactor("")).toBeNull();
    expect(parseLateFactor("1.01")).toBeNull();
    expect(parseLateFactor("-0.1")).toBeNull();
    expect(parseLateFactor("0.555")).toBeNull();
    expect(parseLateFactor(".5")).toBeNull();
  });
});

describe("late entry copy", () => {
  it("says Late at full weight and adds the factor when penalized", () => {
    expect(lateEntryLabel(1)).toBe("Late");
    expect(lateEntryLabel(0.5)).toBe("Late · 0.50");
    expect(formatLateFactor(0.5)).toBe("0.50");
  });

  it("tells the manager the window is one save", () => {
    expect(lateEntryNote(1, "open")).toBe("Late entry. One save, then it locks.");
    expect(lateEntryNote(0.25, "open")).toBe("Late entry at 0.25 weight. One save, then it locks.");
    expect(lateEntryNote(1, "locked")).toBe("Late entry. Predictions are locked.");
    expect(lateEntryNote(0.25, "locked")).toBe("Late entry at 0.25 weight. Predictions are locked.");
  });

  it("keeps the peer suffix quiet unless the factor is below 1", () => {
    expect(latePenaltySuffix(1)).toBe("");
    expect(latePenaltySuffix(0.5)).toBe("Late 0.50");
  });
});

describe("lateUnlockWarning", () => {
  it("stays quiet when nothing is resolved", () => {
    expect(resolvedCoupleCount(["active", "active"])).toBe(0);
    expect(lateUnlockWarning(0)).toBeNull();
  });

  it("warns that resolved couples will not be paid", () => {
    expect(resolvedCoupleCount(["eliminated", "winner", "active", "withdrawn"])).toBe(3);
    expect(lateUnlockWarning(1)).toMatch(/1 couple already has/);
    expect(lateUnlockWarning(1)).toMatch(/will not earn points/);
    expect(lateUnlockWarning(2)).toMatch(/2 couples already have/);
    expect(lateUnlockWarning(2)).toMatch(/still remaining/);
  });
});

describe("late scoring adjustments", () => {
  const late = new Map([
    ["ann", { lateFactor: 0.5, ineligibleCoupleIds: new Set(["gone"]) }],
  ]);

  it("drops couples that were already resolved when the late bracket was saved", () => {
    const eligible = eligibleGrandFinalePredictions(
      [
        { managerId: "ann", coupleId: "gone" },
        { managerId: "ann", coupleId: "still" },
        { managerId: "bea", coupleId: "gone" },
      ],
      late
    );
    expect(eligible.map((p) => `${p.managerId}:${p.coupleId}`)).toEqual(["ann:still", "bea:gone"]);
  });

  it("scales only the late manager's raw points", () => {
    expect(scaleGrandFinaleLateFactors({ ann: 10, bea: 10 }, late)).toEqual({ ann: 5, bea: 10 });
  });
});
