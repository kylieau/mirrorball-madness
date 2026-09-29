import { describe, expect, it } from "vitest";
import {
  allowLateButtonLabel,
  eligibleGrandFinalePredictions,
  formatLateFactor,
  formatLateMultiplier,
  lateEntryBanner,
  lateEntryLabel,
  lateEntryNote,
  latePenaltySuffix,
  lateScoreHistoryHelper,
  lateUnlockWarning,
  managerInitials,
  parseLateFactor,
  parseLatePercent,
  percentToLateFactor,
  resolvedCoupleCount,
  scaleGrandFinaleLateFactors,
  updateLateButtonLabel,
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

describe("percent and late factor", () => {
  it("accepts a whole percent from 0 to 100", () => {
    expect(parseLatePercent("100")).toBe(100);
    expect(parseLatePercent("0")).toBe(0);
    expect(parseLatePercent(" 50 ")).toBe(50);
    expect(parseLatePercent("")).toBeNull();
    expect(parseLatePercent("100.5")).toBeNull();
    expect(parseLatePercent("101")).toBeNull();
    expect(parseLatePercent("-1")).toBeNull();
  });

  it("maps percent onto the 0–1 factor the RPC stores", () => {
    expect(percentToLateFactor(100)).toBe(1);
    expect(percentToLateFactor(50)).toBe(0.5);
    expect(percentToLateFactor(33)).toBe(0.33);
    expect(percentToLateFactor(1)).toBe(0.01);
    expect(percentToLateFactor(0)).toBe(0);
  });

  it("formats the Score History multiplier", () => {
    expect(formatLateMultiplier(1)).toBe("1.0");
    expect(formatLateMultiplier(0.5)).toBe("0.5");
    expect(formatLateMultiplier(0.25)).toBe("0.25");
    expect(formatLateFactor(0.5)).toBe("0.50");
  });
});

describe("late entry copy", () => {
  it("says Late at full weight and adds the percent when penalized", () => {
    expect(lateEntryLabel(1)).toBe("Late");
    expect(lateEntryLabel(0.5)).toBe("Late · 50%");
    expect(lateEntryBanner(0.5)).toBe("Late entry · 50% of Grand Finale");
    expect(lateEntryBanner(1)).toBe("Late entry · 100% of Grand Finale");
  });

  it("tells the manager this is a one-shot percent of Grand Finale", () => {
    expect(lateEntryNote(1, "open")).toBe(
      "One-shot submit · scores at 100% of Grand Finale (full credit)."
    );
    expect(lateEntryNote(0.5, "open")).toBe(
      "One-shot submit · scores at 50% of Grand Finale (× 0.5 late on Score History)."
    );
    expect(lateEntryNote(1, "locked")).toBe("Late entry · full Grand Finale credit. Predictions are locked.");
    expect(lateEntryNote(0.25, "locked")).toBe(
      "Late entry · scores at 25% of Grand Finale (× 0.25 late). Predictions are locked."
    );
  });

  it("keeps the peer suffix quiet unless the factor is below 1", () => {
    expect(latePenaltySuffix(1)).toBe("");
    expect(latePenaltySuffix(0.5)).toBe("× 0.5 late");
    expect(latePenaltySuffix(0.25)).toBe("× 0.25 late");
  });

  it("names the confirm button and Score History helper from the percent", () => {
    expect(allowLateButtonLabel(100)).toBe("Allow late entry");
    expect(allowLateButtonLabel(50)).toBe("Allow late entry · 50%");
    expect(updateLateButtonLabel(100)).toBe("Update to 100%");
    expect(updateLateButtonLabel(50)).toBe("Update to 50%");
    expect(lateScoreHistoryHelper(100)).toEqual({
      percentLabel: "100% of Grand Finale",
      detail: "(full credit).",
      history: "Managers see × 1.0 late on Score History",
    });
    expect(lateScoreHistoryHelper(50)).toEqual({
      percentLabel: "50% of Grand Finale",
      detail: "(× 0.5 late).",
      history: "Managers see × 0.5 late on Score History",
    });
  });

  it("builds initials and skips a co-manager ampersand", () => {
    expect(managerInitials("Jordan Lee")).toBe("JL");
    expect(managerInitials("Bea & Cal")).toBe("BC");
    expect(managerInitials("Madonna")).toBe("M");
  });
});

describe("lateUnlockWarning", () => {
  it("stays quiet when nothing is resolved", () => {
    expect(resolvedCoupleCount(["active", "active"])).toBe(0);
    expect(lateUnlockWarning(0)).toBeNull();
  });

  it("warns without blocking once any outcome is in", () => {
    expect(resolvedCoupleCount(["eliminated", "winner", "active", "withdrawn"])).toBe(3);
    const warning = lateUnlockWarning(2);
    expect(warning).toMatch(/not a hard block/);
    expect(warning).toBe(lateUnlockWarning(1));
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
