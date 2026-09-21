import { describe, expect, it } from "vitest";
import {
  adaptCurtainCallPick,
  adaptDraftQueue,
  adaptGrandFinaleOrder,
  defaultSelection,
  isSelectable,
  planDestination,
  planQueueDestination,
} from "./copy-picks";

const now = new Date("2026-09-22T12:00:00Z");
const future = "2026-09-23T00:00:00Z";
const past = "2026-09-21T00:00:00Z";

const base = {
  moduleLabel: "Curtain Call",
  moduleOn: true,
  lockAt: future,
  missingLockIsLocked: false,
  hasPick: false,
  now,
};

describe("planDestination", () => {
  it("offers an open league with no pick as ok", () => {
    expect(planDestination(base)).toEqual({ status: "ok", note: null });
  });

  it("flags an existing pick as will_replace", () => {
    expect(planDestination({ ...base, hasPick: true }).status).toBe("will_replace");
  });

  it("names the module when it is off, ahead of any lock", () => {
    expect(planDestination({ ...base, moduleOn: false, lockAt: past })).toEqual({
      status: "module_off",
      note: "Curtain Call is off in this league",
    });
  });

  it("locks once the destination's own lock time has passed", () => {
    expect(planDestination({ ...base, lockAt: past, hasPick: true }).status).toBe("locked");
  });

  it("treats a missing Curtain Call lock as open", () => {
    expect(planDestination({ ...base, lockAt: null }).status).toBe("ok");
  });

  it("treats a missing Grand Finale deadline as locked", () => {
    expect(planDestination({ ...base, lockAt: null, missingLockIsLocked: true }).status).toBe("locked");
  });
});

describe("selection", () => {
  const destinations = [
    { id: "a", name: "A", status: "ok" as const, note: null },
    { id: "b", name: "B", status: "will_replace" as const, note: "" },
    { id: "c", name: "C", status: "locked" as const, note: "" },
    { id: "d", name: "D", status: "module_off" as const, note: "" },
  ];

  it("only pre-ticks leagues with nothing to replace", () => {
    expect(defaultSelection(destinations)).toEqual(["a"]);
  });

  it("allows ticking ok and will_replace but not locked or off", () => {
    expect(destinations.filter((d) => isSelectable(d.status)).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("adaptCurtainCallPick", () => {
  it("blanks couples the viewer no longer sees as competing", () => {
    expect(
      adaptCurtainCallPick(
        { elim1: "gone", elim2: "b", topScorer: "a" },
        new Set(["a", "b"])
      )
    ).toEqual({ elim1: null, elim2: "b", topScorer: "a" });
  });

  it("keeps nulls as null", () => {
    expect(adaptCurtainCallPick({ elim1: null, elim2: null, topScorer: null }, new Set(["a"]))).toEqual({
      elim1: null,
      elim2: null,
      topScorer: null,
    });
  });
});

describe("adaptGrandFinaleOrder", () => {
  const season = ["a", "b", "c", "d"];

  it("moves already-revealed eliminations to the front, keeping the rest in order", () => {
    expect(adaptGrandFinaleOrder(["b", "c", "a", "d"], season, ["a"])).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the order unchanged when nothing is pinned", () => {
    expect(adaptGrandFinaleOrder(["d", "c", "b", "a"], season, [])).toEqual(["d", "c", "b", "a"]);
  });

  it("returns null when the source order is missing a season couple", () => {
    expect(adaptGrandFinaleOrder(["a", "b", "c"], season, [])).toBeNull();
  });

  it("ignores couples outside the season and still requires full coverage", () => {
    expect(adaptGrandFinaleOrder(["x", "a", "b", "c", "d"], season, [])).toEqual(["a", "b", "c", "d"]);
    expect(adaptGrandFinaleOrder(["x", "a", "b", "c"], season, [])).toBeNull();
  });
});

describe("planQueueDestination", () => {
  const open = { danceCardOn: true, draftCompleted: false, hasQueue: false };

  it("offers a league with no queue as ok", () => {
    expect(planQueueDestination(open)).toEqual({ status: "ok", note: null });
  });

  it("flags an existing queue as will_replace", () => {
    expect(planQueueDestination({ ...open, hasQueue: true }).status).toBe("will_replace");
  });

  it("reports Dance Card off ahead of a finished draft", () => {
    expect(planQueueDestination({ danceCardOn: false, draftCompleted: true, hasQueue: true })).toEqual({
      status: "module_off",
      note: "Dance Card is off in this league",
    });
  });

  it("locks once the draft is over", () => {
    expect(planQueueDestination({ ...open, draftCompleted: true }).status).toBe("locked");
  });
});

describe("adaptDraftQueue", () => {
  it("keeps the order and drops couples outside the season", () => {
    expect(adaptDraftQueue(["c", "x", "a"], ["a", "b", "c"])).toEqual(["c", "a"]);
  });
});
