import { describe, expect, it } from "vitest";
import { isRecastMiss, moveRecastClaim, recastDraftRank, recastOrder, recastWire } from "./recast";

describe("recastOrder", () => {
  const managers = [
    { managerId: "first-pick", draftRank: 1 },
    { managerId: "second-pick", draftRank: 2 },
    { managerId: "third-pick", draftRank: 3 },
  ];
  const ids = (totals: [string, number, number][]) =>
    recastOrder(managers, totals.map(([managerId, weekNumber, totalPoints]) => ({ managerId, weekNumber, totalPoints }))).map(
      (entry) => entry.managerId
    );

  it("starts from the draft reversed when nobody has scored", () => {
    expect(ids([])).toEqual(["third-pick", "second-pick", "first-pick"]);
  });

  it("puts the lowest season total first", () => {
    expect(ids([["first-pick", 8, 5], ["second-pick", 8, 20], ["third-pick", 8, 12]])).toEqual([
      "first-pick",
      "third-pick",
      "second-pick",
    ]);
  });

  it("breaks a level season on the lower latest week, then on the later draft pick", () => {
    expect(
      ids([
        ["first-pick", 8, 12], ["first-pick", 9, 8],
        ["second-pick", 8, 10], ["second-pick", 9, 10],
        ["third-pick", 8, 10], ["third-pick", 9, 10],
      ])
    ).toEqual(["first-pick", "third-pick", "second-pick"]);
  });

  it("reads the latest week from the league, so a manager with no row there counts as zero", () => {
    expect(ids([["first-pick", 8, 10], ["second-pick", 8, 6], ["second-pick", 9, 4]])).toEqual([
      "third-pick",
      "first-pick",
      "second-pick",
    ]);
  });

  it("reports the totals it ordered by, rounded like every other points total", () => {
    const totals = [
      { managerId: "first-pick", weekNumber: 8, totalPoints: 0.1 },
      { managerId: "first-pick", weekNumber: 9, totalPoints: 0.2 },
    ];
    expect(recastOrder(managers, totals)[2]).toEqual({ managerId: "first-pick", seasonTotal: 0.3, lastWeekTotal: 0.2 });
  });
});

describe("recastDraftRank", () => {
  const member = { user_id: "b", draft_position: 1 };

  it("is the draft position in a snake or linear draft", () => {
    expect(recastDraftRank({ draft_type: "snake", custom_pick_order: null }, member)).toBe(1);
  });

  it("is the first appearance in a custom order", () => {
    expect(recastDraftRank({ draft_type: "custom", custom_pick_order: ["a", "b", "b", "a"] }, member)).toBe(2);
    expect(recastDraftRank({ draft_type: "custom", custom_pick_order: ["a"] }, member)).toBeNull();
  });
});

describe("recastWire", () => {
  const wire = (overrides: Partial<Parameters<typeof recastWire>[0]> = {}) =>
    recastWire({
      dancingCoupleIds: ["free", "mine", "theirs", "dropping"],
      heldCoupleIds: new Set(["mine", "theirs", "dropping"]),
      pendingDrops: [{ coupleId: "dropping", managerId: "rival" }],
      teamId: "me",
      dropLockedCoupleIds: new Set(),
      ...overrides,
    });

  it("lists free couples and another manager's pending drops", () => {
    expect(wire()).toEqual([
      { coupleId: "free", droppedBy: null },
      { coupleId: "dropping", droppedBy: "rival" },
    ]);
  });

  it("leaves out a couple the viewer is dropping themselves", () => {
    expect(wire({ pendingDrops: [{ coupleId: "mine", managerId: "me" }] })).toEqual([{ coupleId: "free", droppedBy: null }]);
  });

  it("leaves out a couple the viewer dropped in the last run", () => {
    expect(wire({ dropLockedCoupleIds: new Set(["free"]) })).toEqual([{ coupleId: "dropping", droppedBy: "rival" }]);
  });
});

describe("moveRecastClaim", () => {
  const list = ["a", "b", "c"].map((coupleId, index) => ({ coupleId, slotNumber: index + 1, dropCoupleId: null }));
  const moved = (index: number, by: -1 | 1) => moveRecastClaim(list, index, by).map((claim) => claim.coupleId);

  it("swaps a claim with its neighbour", () => {
    expect(moved(1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(1, 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone at either end", () => {
    expect(moved(0, -1)).toEqual(["a", "b", "c"]);
    expect(moved(2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("isRecastMiss", () => {
  it("is every result but an award", () => {
    expect(isRecastMiss("taken")).toBe(true);
    expect(isRecastMiss("awarded")).toBe(false);
    expect(isRecastMiss(null)).toBe(false);
  });
});
