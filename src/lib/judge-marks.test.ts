import { describe, expect, it } from "vitest";
import { isValidMark, JUDGE_MARK_MESSAGE, markInputError } from "./judge-marks";

describe("judge marks", () => {
  it("takes whole marks from 1 to 10 only", () => {
    expect([1, 7, 10].map(isValidMark)).toEqual([true, true, true]);
    expect([0, 8.5, 11, -1, Number.NaN].map(isValidMark)).toEqual([false, false, false, false, false]);
  });

  it("treats a blank box as not entered and anything else invalid as an error", () => {
    expect(markInputError("")).toBeNull();
    expect(markInputError(" 8 ")).toBeNull();
    expect(["0", "8.5", "11", "x"].map(markInputError)).toEqual(Array(4).fill(JUDGE_MARK_MESSAGE));
    expect(JUDGE_MARK_MESSAGE).toBe("Judge scores must be whole numbers from 1 to 10.");
  });
});
