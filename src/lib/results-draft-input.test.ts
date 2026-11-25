import { describe, expect, it } from "vitest";
import {
  ADD_SPECIAL_VALUE,
  coupleIdsForDraft,
  placeDraftDances,
  teamPickValue,
} from "./results-draft-input";

describe("coupleIdsForDraft", () => {
  const known = new Set(["amber", "julia"]);

  it("never sends a team: id or + Add Special Dance", () => {
    expect(
      coupleIdsForDraft(
        [teamPickValue("slaytopia"), ADD_SPECIAL_VALUE, "amber", "julia", "stranger"],
        known
      )
    ).toEqual(["amber", "julia"]);
  });

  it("keeps a real couple id even when a special dance happens to use the same uuid as a prefix", () => {
    expect(coupleIdsForDraft(["amber"], known)).toEqual(["amber"]);
  });
});

describe("placeDraftDances", () => {
  const dance = (id: string, slot: number | null) => ({ id, slot });
  const ids = (slots: ({ id: string } | null)[]) => slots.map((d) => d?.id ?? null);

  it("puts a later round's dance saved alone back in its own slot", () => {
    expect(ids(placeDraftDances([dance("freestyle", 3)], 3))).toEqual([null, null, "freestyle"]);
  });

  it("keeps each dance in its slot whatever order the rows come back in", () => {
    expect(ids(placeDraftDances([dance("c", 3), dance("a", 1), dance("b", 2)], 3))).toEqual(["a", "b", "c"]);
  });

  it("fills empty slots in order with dances that have no slot, as before", () => {
    expect(ids(placeDraftDances([dance("old", null)], 3))).toEqual(["old", null, null]);
    expect(ids(placeDraftDances([dance("third", 3), dance("old", null), dance("older", null)], 3))).toEqual(["old", "older", "third"]);
  });

  it("moves a dance whose slot is taken to the first empty slot", () => {
    expect(ids(placeDraftDances([dance("a", 2), dance("b", 2)], 3))).toEqual(["b", "a", null]);
  });

  it("keeps a dance past the expected count and gives a couple with nothing one slot", () => {
    expect(ids(placeDraftDances([dance("extra", 4)], 3))).toEqual([null, null, null, "extra"]);
    expect(ids(placeDraftDances([], 0))).toEqual([null]);
    expect(ids(placeDraftDances([], 3))).toEqual([null, null, null]);
  });
});
