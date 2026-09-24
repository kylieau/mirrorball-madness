import { describe, expect, it } from "vitest";
import { formatPoints, formatSignedPoints, roundPoints } from "./format-points";

describe("roundPoints", () => {
  it("rounds to two decimals and removes float noise", () => {
    expect(roundPoints(10.299999999999999)).toBe(10.3);
    expect(roundPoints(5.099999999999998)).toBe(5.1);
    expect(roundPoints(1.005 * 100)).toBe(100.5);
    expect(roundPoints(12)).toBe(12);
  });
});

describe("formatPoints", () => {
  it("always shows two decimals, even for whole numbers", () => {
    expect(formatPoints(12)).toBe("12.00");
    expect(formatPoints(0)).toBe("0.00");
    expect(formatPoints(17.1)).toBe("17.10");
    expect(formatPoints(10.299999999999999)).toBe("10.30");
  });

  it("keeps negatives and never renders negative zero", () => {
    expect(formatPoints(-4.5)).toBe("-4.50");
    expect(formatPoints(-0.001)).toBe("0.00");
  });
});

describe("formatSignedPoints", () => {
  it("prefixes + for zero and positives", () => {
    expect(formatSignedPoints(18.4)).toBe("+18.40");
    expect(formatSignedPoints(0)).toBe("+0.00");
  });

  it("leaves negatives with their own sign", () => {
    expect(formatSignedPoints(-3)).toBe("-3.00");
    expect(formatSignedPoints(-0.001)).toBe("+0.00");
  });
});
