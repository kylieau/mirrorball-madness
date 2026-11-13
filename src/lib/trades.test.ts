import { describe, expect, it } from "vitest";
import {
  tradeEffectiveWeek,
  isTradeFailure,
  tradeDraftProblem,
  tradeLogVisible,
  tradePartyIds,
  tradeSides,
  vetoVotesNeeded,
  type TradeLeg,
} from "./trades";

const couple = (from: string, to: string, coupleId: string): TradeLeg => ({
  fromManagerId: from,
  toManagerId: to,
  coupleId,
  points: null,
});
const points = (from: string, to: string, amount: number): TradeLeg => ({
  fromManagerId: from,
  toManagerId: to,
  coupleId: null,
  points: amount,
});

describe("tradeDraftProblem", () => {
  it("accepts a swap, a couple for points and a three-way", () => {
    expect(tradeDraftProblem([couple("me", "kim", "a"), couple("kim", "me", "b")], "me")).toBeNull();
    expect(tradeDraftProblem([couple("kim", "me", "b"), points("me", "kim", 5)], "me")).toBeNull();
    expect(
      tradeDraftProblem([couple("me", "kim", "a"), couple("kim", "pat", "b"), couple("pat", "me", "c")], "me")
    ).toBeNull();
  });

  it("needs at least one couple", () => {
    expect(tradeDraftProblem([], "me")).toBe("A trade has to move at least one couple");
    expect(tradeDraftProblem([points("me", "kim", 5)], "me")).toBe("A trade has to move at least one couple");
  });

  it("holds up to twelve parts", () => {
    const legs = Array.from({ length: 13 }, (_, index) => couple("me", "kim", `c${index}`));
    expect(tradeDraftProblem(legs, "me")).toBe("A trade holds up to 12 parts");
  });

  it("needs the proposer in it", () => {
    expect(tradeDraftProblem([couple("kim", "pat", "a")], "me")).toBe("You have to be part of a trade you propose");
  });

  it("moves a couple once", () => {
    expect(tradeDraftProblem([couple("me", "kim", "a"), couple("kim", "pat", "a")], "me")).toBe(
      "A couple can only move once in a trade"
    );
  });

  it("keeps one points amount per sender and receiver", () => {
    const base = [couple("kim", "me", "b"), points("me", "kim", 5)];
    expect(tradeDraftProblem([...base, points("me", "kim", 1)], "me")).toBe(
      "Put the points one manager sends another into one amount"
    );
    expect(tradeDraftProblem([...base, points("kim", "me", 1)], "me")).toBeNull();
  });
});

describe("tradePartyIds", () => {
  it("lists every manager once", () => {
    expect(tradePartyIds([couple("me", "kim", "a"), couple("kim", "pat", "b"), points("pat", "me", 2)])).toEqual([
      "me",
      "kim",
      "pat",
    ]);
  });
});

describe("tradeSides", () => {
  it("gives each manager what they send, senders first", () => {
    expect(
      tradeSides([couple("kim", "me", "a"), points("kim", "me", 2), couple("me", "kim", "b"), points("kim", "me", 1.5)])
    ).toEqual([
      { managerId: "kim", coupleIds: ["a"], points: 3.5 },
      { managerId: "me", coupleIds: ["b"], points: 0 },
    ]);
    expect(tradeSides([couple("pat", "me", "a")])).toEqual([
      { managerId: "pat", coupleIds: ["a"], points: 0 },
      { managerId: "me", coupleIds: [], points: 0 },
    ]);
  });
});

describe("vetoVotesNeeded", () => {
  it("is more than half of the teams outside the trade", () => {
    expect(vetoVotesNeeded(4, 2)).toBe(2);
    expect(vetoVotesNeeded(5, 2)).toBe(2);
    expect(vetoVotesNeeded(6, 2)).toBe(3);
    expect(vetoVotesNeeded(4, 3)).toBe(1);
  });

  it("is null when every team is in the trade", () => {
    expect(vetoVotesNeeded(3, 3)).toBeNull();
  });
});

describe("tradeLogVisible", () => {
  it("never lists a trade that is still open", () => {
    expect(tradeLogVisible({ status: "proposed", weekNumber: null }, 9, false)).toBe(false);
    expect(tradeLogVisible({ status: "accepted", weekNumber: null }, 9, false)).toBe(false);
  });

  it("lists every settled trade for a viewer who is caught up", () => {
    expect(tradeLogVisible({ status: "vetoed", weekNumber: null }, 9, false)).toBe(true);
    expect(tradeLogVisible({ status: "executed", weekNumber: 9 }, 9, false)).toBe(true);
  });

  it("holds back what a viewer who is behind hasn't watched", () => {
    expect(tradeLogVisible({ status: "executed", weekNumber: 9 }, 9, true)).toBe(true);
    expect(tradeLogVisible({ status: "executed", weekNumber: 10 }, 9, true)).toBe(false);
    expect(tradeLogVisible({ status: "vetoed", weekNumber: null }, 9, true)).toBe(false);
    expect(tradeLogVisible({ status: "failed", weekNumber: 9 }, null, true)).toBe(false);
  });
});

describe("isTradeFailure", () => {
  it("recognises the run's failure reasons", () => {
    expect(isTradeFailure("not_dancing")).toBe(true);
    expect(isTradeFailure("in_other_trade")).toBe(false);
    expect(isTradeFailure(null)).toBe(false);
  });
});

describe("tradeEffectiveWeek", () => {
  const night = (airsAt: string, published = false) => ({ airsAt, published });
  const weeks = [
    { weekNumber: 9, nights: [night("2026-11-11T01:00:00Z", true)] },
    { weekNumber: 10, nights: [night("2026-11-18T01:00:00Z")] },
    { weekNumber: 11, nights: [night("2026-11-25T01:00:00Z")] },
  ];
  const now = new Date("2026-11-13T05:00:00Z");

  it("moves couples from the first week that hasn't aired a tick after the window closes", () => {
    expect(tradeEffectiveWeek(weeks, "2026-11-14T05:00:00Z", now)).toEqual({ week: 10, waitsFor: null, aired: false });
    // 4:50 PM PT Tuesday: the tick lands after the 5 PM curtain.
    expect(tradeEffectiveWeek(weeks, "2026-11-18T00:50:00Z", now)).toEqual({ week: 11, waitsFor: 10, aired: true });
  });

  it("reads a window that has already closed at the next tick, not at its end", () => {
    // Closed Monday, still unexecuted on Tuesday night: it lands after the curtain.
    expect(tradeEffectiveWeek(weeks, "2026-11-16T05:00:00Z", new Date("2026-11-18T02:00:00Z"))).toEqual({
      week: 11,
      waitsFor: 10,
      aired: false,
    });
  });

  it("waits only on a night that has aired and isn't posted", () => {
    const twoNights = [
      weeks[0],
      { weekNumber: 10, nights: [night("2026-11-17T01:00:00Z", true), night("2026-11-18T01:00:00Z")] },
      weeks[2],
    ];
    // Between the nights: the first is posted, the second hasn't aired.
    expect(tradeEffectiveWeek(twoNights, "2026-11-17T12:00:00Z", new Date("2026-11-17T11:00:00Z"))).toEqual({
      week: 11,
      waitsFor: null,
      aired: false,
    });
  });
});
