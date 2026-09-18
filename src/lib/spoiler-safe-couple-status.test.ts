import { describe, expect, it } from "vitest";
import { isSpoilerSafeActive, spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";

describe("spoilerSafeCoupleStatus", () => {
  it("clamps an eliminated couple to active before the cutoff, reveals at the cutoff week", () => {
    const couple = { status: "eliminated", eliminationWeek: 3 };
    expect(spoilerSafeCoupleStatus(couple, 2, null)).toBe("active");
    expect(spoilerSafeCoupleStatus(couple, 3, null)).toBe("eliminated");
    expect(spoilerSafeCoupleStatus(couple, 4, null)).toBe("eliminated");
  });

  it("resolves podium placements against the finale week, not the elimination week", () => {
    const winner = { status: "winner", eliminationWeek: null };
    expect(spoilerSafeCoupleStatus(winner, 9, 10)).toBe("active");
    expect(spoilerSafeCoupleStatus(winner, 10, 10)).toBe("winner");
  });

  it("clamps every resolving status when cutoffWeek is null (nothing watched yet)", () => {
    expect(spoilerSafeCoupleStatus({ status: "eliminated", eliminationWeek: 1 }, null, null)).toBe("active");
    expect(spoilerSafeCoupleStatus({ status: "winner", eliminationWeek: null }, null, 10)).toBe("active");
  });

  it("passes through a non-resolving status regardless of cutoff", () => {
    expect(spoilerSafeCoupleStatus({ status: "active", eliminationWeek: null }, null, null)).toBe("active");
    expect(spoilerSafeCoupleStatus({ status: "active", eliminationWeek: null }, 5, 10)).toBe("active");
  });
});

describe("isSpoilerSafeActive", () => {
  it("keeps an unrevealed elim in the active pool and drops them once revealed", () => {
    const couple = { status: "eliminated", eliminationWeek: 3 };
    expect(isSpoilerSafeActive(couple, 2, null)).toBe(true);
    expect(isSpoilerSafeActive(couple, 3, null)).toBe(false);
  });
});
