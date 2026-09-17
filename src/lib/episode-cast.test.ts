import { describe, expect, it } from "vitest";
import {
  defaultCheckedParticipantIds,
  isActiveCastStatus,
  isFullSelectableCast,
  participantIdsToPersist,
  resultsEntryCoupleIds,
  selectableCast,
  wasInCastForWeek,
} from "./episode-cast";

const active = { id: "a", status: "active", elimination_week: null };
const outWeek3 = { id: "b", status: "eliminated", elimination_week: 3 };
const withdrewWeek2 = { id: "c", status: "withdrawn", elimination_week: 2 };
const winner = { id: "d", status: "winner", elimination_week: null };
const runnerUp = { id: "e", status: "runner_up", elimination_week: null };

describe("isActiveCastStatus", () => {
  it("is only true for still-competing couples", () => {
    expect(isActiveCastStatus("active")).toBe(true);
    expect(isActiveCastStatus("eliminated")).toBe(false);
    expect(isActiveCastStatus("withdrawn")).toBe(false);
    expect(isActiveCastStatus("winner")).toBe(false);
  });
});

describe("wasInCastForWeek", () => {
  it("keeps an active couple on every week", () => {
    expect(wasInCastForWeek(active, 1)).toBe(true);
    expect(wasInCastForWeek(active, 10)).toBe(true);
  });

  it("keeps an eliminated couple on the week they went home and earlier, not later", () => {
    expect(wasInCastForWeek(outWeek3, 2)).toBe(true);
    expect(wasInCastForWeek(outWeek3, 3)).toBe(true);
    expect(wasInCastForWeek(outWeek3, 4)).toBe(false);
  });

  it("treats withdrawn the same as eliminated for later weeks", () => {
    expect(wasInCastForWeek(withdrewWeek2, 2)).toBe(true);
    expect(wasInCastForWeek(withdrewWeek2, 3)).toBe(false);
  });

  it("keeps podium couples on historical weeks (they danced all season)", () => {
    expect(wasInCastForWeek(winner, 1)).toBe(true);
    expect(wasInCastForWeek(runnerUp, 8)).toBe(true);
  });
});

describe("selectableCast", () => {
  const cast = [active, outWeek3, withdrewWeek2, winner];

  it("hides departed couples from unpublished / new schedule pickers", () => {
    expect(selectableCast(cast, 6, { published: false }).map((c) => c.id)).toEqual(["a"]);
  });

  it("keeps the week-3 eliminated couple when editing that published week", () => {
    expect(selectableCast(cast, 3, { published: true }).map((c) => c.id)).toEqual(["a", "b", "d"]);
  });

  it("drops anyone already gone before a published earlier week", () => {
    expect(selectableCast(cast, 2, { published: true }).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("defaultCheckedParticipantIds", () => {
  const selectable = ["a", "c"];

  it("checks the full selectable cast when nothing was configured", () => {
    expect(defaultCheckedParticipantIds(undefined, selectable)).toEqual(["a", "c"]);
    expect(defaultCheckedParticipantIds([], selectable)).toEqual(["a", "c"]);
  });

  it("drops configured ids that are no longer selectable (already eliminated)", () => {
    expect(defaultCheckedParticipantIds(["a", "b", "c"], selectable)).toEqual(["a", "c"]);
  });

  it("keeps a real split-broadcast subset", () => {
    expect(defaultCheckedParticipantIds(["c"], selectable)).toEqual(["c"]);
  });
});

describe("participantIdsToPersist", () => {
  it("writes nothing when the selection is the full selectable cast", () => {
    expect(participantIdsToPersist(["a", "c"], ["a", "c"])).toEqual([]);
  });

  it("strips leftover eliminated ids before deciding whether the cast is full", () => {
    expect(participantIdsToPersist(["a", "b", "c"], ["a", "c"])).toEqual([]);
  });

  it("persists a real subset after stripping ghosts", () => {
    expect(participantIdsToPersist(["b", "c"], ["a", "c"])).toEqual(["c"]);
  });
});

describe("isFullSelectableCast", () => {
  it("requires the exact selectable set", () => {
    expect(isFullSelectableCast(["a", "c"], ["a", "c"])).toBe(true);
    expect(isFullSelectableCast(["a"], ["a", "c"])).toBe(false);
    expect(isFullSelectableCast(["a", "b", "c"], ["a", "c"])).toBe(false);
  });
});

describe("resultsEntryCoupleIds", () => {
  it("hides a departed couple from an unpublished week even if a stale draft still has them", () => {
    expect(
      resultsEntryCoupleIds({
        selectableIds: ["a", "c"],
        participantIds: [],
        draftCoupleIds: ["a", "b", "c"],
        published: false,
      })
    ).toEqual(["a", "c"]);
  });

  it("keeps a published week's dancer who is on the correction draft", () => {
    expect(
      resultsEntryCoupleIds({
        selectableIds: ["a", "b"],
        participantIds: ["a"],
        draftCoupleIds: ["a", "b"],
        published: true,
      })
    ).toEqual(["a", "b"]);
  });

  it("does not resurrect a couple already gone before a published week", () => {
    expect(
      resultsEntryCoupleIds({
        selectableIds: ["a", "c"],
        participantIds: [],
        draftCoupleIds: ["a", "b", "c"],
        published: true,
      })
    ).toEqual(["a", "c"]);
  });
});
