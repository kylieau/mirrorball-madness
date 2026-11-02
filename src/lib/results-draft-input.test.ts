import { describe, expect, it } from "vitest";
import {
  ADD_SPECIAL_VALUE,
  coupleIdsForDraft,
  memberPickValue,
  parseMemberPick,
  teamPickValue,
} from "./results-draft-input";

describe("coupleIdsForDraft", () => {
  const known = new Set(["amber", "julia"]);

  it("never sends a team: id, a nested member row, or + Add Special Dance", () => {
    expect(
      coupleIdsForDraft(
        [teamPickValue("slaytopia"), memberPickValue("slaytopia", "amber"), ADD_SPECIAL_VALUE, "amber", "julia", "stranger"],
        known
      )
    ).toEqual(["amber", "julia"]);
  });

  it("keeps a real couple id even when a special dance happens to use the same uuid as a prefix", () => {
    expect(coupleIdsForDraft(["amber"], known)).toEqual(["amber"]);
  });
});

describe("parseMemberPick", () => {
  it("reads member:<entryId>:<coupleId>", () => {
    expect(parseMemberPick(memberPickValue("team-1", "couple-2"))).toEqual({ entryId: "team-1", coupleId: "couple-2" });
    expect(parseMemberPick("team:x")).toBeNull();
    expect(parseMemberPick("member:")).toBeNull();
  });
});
