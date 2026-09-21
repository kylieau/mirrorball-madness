import { describe, expect, it } from "vitest";
import {
  autoPickTrigger,
  eligibleRemaining,
  getPickAssignment,
  isBenignAutoPickError,
  moveQueueEntry,
  pickFromQueue,
  partitionPresence,
  reconcileOrder,
  pickRandomEligible,
  secondsRemainingOnClock,
} from "./draft";

describe("getPickAssignment", () => {
  it("reverses order each round for snake (default)", () => {
    expect(getPickAssignment(1, 4)).toEqual({ round: 1, draftPosition: 1 });
    expect(getPickAssignment(4, 4)).toEqual({ round: 1, draftPosition: 4 });
    expect(getPickAssignment(5, 4)).toEqual({ round: 2, draftPosition: 4 });
    expect(getPickAssignment(8, 4)).toEqual({ round: 2, draftPosition: 1 });
    expect(getPickAssignment(9, 4)).toEqual({ round: 3, draftPosition: 1 });
  });

  it("repeats the same order every round for linear", () => {
    expect(getPickAssignment(1, 4, "linear")).toEqual({ round: 1, draftPosition: 1 });
    expect(getPickAssignment(4, 4, "linear")).toEqual({ round: 1, draftPosition: 4 });
    expect(getPickAssignment(5, 4, "linear")).toEqual({ round: 2, draftPosition: 1 });
    expect(getPickAssignment(8, 4, "linear")).toEqual({ round: 2, draftPosition: 4 });
  });
});

describe("eligibleRemaining", () => {
  it("drops already-drafted ids and keeps the rest in order", () => {
    const all = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(eligibleRemaining(all, new Set(["b"]))).toEqual([{ id: "a" }, { id: "c" }]);
  });

  it("returns an empty list when everyone is taken", () => {
    expect(eligibleRemaining([{ id: "a" }], new Set(["a"]))).toEqual([]);
  });
});

describe("pickRandomEligible", () => {
  it("returns null when nothing is left", () => {
    expect(pickRandomEligible([])).toBeNull();
  });

  it("returns the only remaining item", () => {
    expect(pickRandomEligible(["only"], () => 0.42)).toEqual("only");
  });

  it("picks uniformly from eligible remaining using the injected rng", () => {
    const eligible = ["a", "b", "c", "d"];
    expect(pickRandomEligible(eligible, () => 0)).toBe("a");
    expect(pickRandomEligible(eligible, () => 0.25)).toBe("b");
    expect(pickRandomEligible(eligible, () => 0.5)).toBe("c");
    expect(pickRandomEligible(eligible, () => 0.75)).toBe("d");
  });

  it("does not prefer any skill ordering — input order is the only structure", () => {
    const ranked = ["best", "mid", "worst"];
    expect(pickRandomEligible(ranked, () => 0.9)).toBe("worst");
    expect(pickRandomEligible(ranked, () => 0)).toBe("best");
  });

  it("treats rng values outside [0, 1) as the first slot", () => {
    const eligible = ["a", "b"];
    expect(pickRandomEligible(eligible, () => 1)).toBe("a");
    expect(pickRandomEligible(eligible, () => -0.3)).toBe("a");
    expect(pickRandomEligible(eligible, () => Number.NaN)).toBe("a");
  });
});

describe("secondsRemainingOnClock", () => {
  const start = "2026-09-18T02:00:00.000Z";
  const startMs = Date.parse(start);

  it("counts down from the server turn timestamp", () => {
    expect(secondsRemainingOnClock(start, 90, startMs)).toBe(90);
    expect(secondsRemainingOnClock(start, 90, startMs + 30_000)).toBe(60);
    expect(secondsRemainingOnClock(start, 90, startMs + 90_000)).toBe(0);
    expect(secondsRemainingOnClock(start, 90, startMs + 120_000)).toBe(0);
  });

  it("gives a full clock when the server timestamp is missing", () => {
    expect(secondsRemainingOnClock(null, 90, startMs)).toBe(90);
    expect(secondsRemainingOnClock(undefined, 15, startMs)).toBe(15);
  });
});

describe("autoPickTrigger", () => {
  it("does not fire before the draft starts or after it completes", () => {
    expect(
      autoPickTrigger({ draftStatus: "not_started", clockExpired: true, onTheClockAutopilot: true })
    ).toBeNull();
    expect(
      autoPickTrigger({ draftStatus: "completed", clockExpired: true, onTheClockAutopilot: true })
    ).toBeNull();
  });

  it("fires autopilot immediately, even if the clock still has time", () => {
    expect(
      autoPickTrigger({
        draftStatus: "in_progress",
        clockExpired: false,
        onTheClockAutopilot: true,
      })
    ).toBe("autopilot");
  });

  it("fires timeout only when the clock is up and the picker is not on autopilot", () => {
    expect(
      autoPickTrigger({
        draftStatus: "in_progress",
        clockExpired: true,
        onTheClockAutopilot: false,
      })
    ).toBe("timeout");
    expect(
      autoPickTrigger({
        draftStatus: "in_progress",
        clockExpired: false,
        onTheClockAutopilot: false,
      })
    ).toBeNull();
  });
});

describe("isBenignAutoPickError", () => {
  it("swallows contention from a simultaneous viewer winning the lock", () => {
    expect(isBenignAutoPickError("Not eligible for an auto-pick yet")).toBe(true);
    expect(isBenignAutoPickError("Draft is not in progress")).toBe(true);
    expect(isBenignAutoPickError("Draft is already complete")).toBe(true);
  });

  it("does not swallow real failures", () => {
    expect(isBenignAutoPickError("You are not a member of this league")).toBe(false);
    expect(isBenignAutoPickError(null)).toBe(false);
  });
});

describe("partitionPresence", () => {
  const members = [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }];

  it("splits members by who is present", () => {
    const { present, absent } = partitionPresence(members, new Set(["a", "c"]));
    expect(present.map((m) => m.user_id)).toEqual(["a", "c"]);
    expect(absent.map((m) => m.user_id)).toEqual(["b"]);
  });

  it("ignores present ids that are not members", () => {
    const { present, absent } = partitionPresence(members, new Set(["a", "zzz"]));
    expect(present).toHaveLength(1);
    expect(absent).toHaveLength(2);
  });

  it("treats everyone as absent when nobody is present", () => {
    expect(partitionPresence(members, new Set()).absent).toHaveLength(3);
  });
});

describe("reconcileOrder", () => {
  it("keeps the arrangement when membership is unchanged", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("drops leavers and appends joiners", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "d"])).toEqual(["a", "b", "d"]);
  });
});

describe("pickFromQueue", () => {
  it("takes the highest-ranked couple that is still eligible", () => {
    expect(pickFromQueue(["a", "b", "c"], new Set(["b", "c"]))).toBe("b");
  });

  it("returns null when the queue is empty or exhausted", () => {
    expect(pickFromQueue([], new Set(["a"]))).toBeNull();
    expect(pickFromQueue(["a"], new Set(["b"]))).toBeNull();
  });
});

describe("moveQueueEntry", () => {
  it("swaps with the neighbour", () => {
    expect(moveQueueEntry(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveQueueEntry(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the edges", () => {
    expect(moveQueueEntry(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveQueueEntry(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});
