import { describe, expect, it } from "vitest";
import { undoSecondsLeft, unpostedCoupleIds } from "./reveal-state";

describe("unpostedCoupleIds", () => {
  it("does not gate publishing when nothing has been posted", () => {
    expect(unpostedCoupleIds([{ coupleId: "a" }, { coupleId: "b" }], new Set())).toEqual([]);
  });

  it("lists each couple with a drafted dance that is not posted yet", () => {
    expect(
      unpostedCoupleIds([{ coupleId: "a" }, { coupleId: "a" }, { coupleId: "b" }], new Set(["a"]))
    ).toEqual(["b"]);
  });

  it("is empty once every couple is posted", () => {
    expect(unpostedCoupleIds([{ coupleId: "a" }], new Set(["a"]))).toEqual([]);
  });
});

describe("undoSecondsLeft", () => {
  const postedAt = "2026-09-24T20:00:00.000Z";
  const at = (secondsAfter: number) => new Date(postedAt).getTime() + secondsAfter * 1000;

  it("counts down from 30 seconds", () => {
    expect(undoSecondsLeft(postedAt, at(0))).toBe(30);
    expect(undoSecondsLeft(postedAt, at(12))).toBe(18);
  });

  it("is zero once the window has passed", () => {
    expect(undoSecondsLeft(postedAt, at(30))).toBe(0);
    expect(undoSecondsLeft(postedAt, at(90))).toBe(0);
  });
});
