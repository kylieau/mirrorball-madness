import { describe, expect, it } from "vitest";
import { couplesRevealState, undoSecondsLeft, unpostedCoupleIds } from "./reveal-state";

const dance = (coupleId: string, judgeCount: number) => ({
  coupleId,
  judgeScores: Array.from({ length: judgeCount }, () => ({ score: 8 })),
});

describe("couplesRevealState", () => {
  it("marks posted, ready and waiting couples", () => {
    const states = couplesRevealState([dance("a", 3), dance("b", 3), dance("c", 0)], new Set(["a"]));
    expect(states.get("a")).toBe("posted");
    expect(states.get("b")).toBe("ready");
    expect(states.get("c")).toBe("waiting");
  });

  it("keeps a couple waiting until every one of its dances has judge scores", () => {
    const states = couplesRevealState([dance("a", 3), dance("a", 0)], new Set());
    expect(states.get("a")).toBe("waiting");
  });

  it("omits couples with no drafted dance", () => {
    expect(couplesRevealState([], new Set()).size).toBe(0);
  });
});

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
