import { describe, expect, it } from "vitest";
import { classifyRosterOccupancy, isOpenRosterStatus, partitionRecastSlots } from "./recast-framing";

describe("isOpenRosterStatus", () => {
  it("is only true for statuses that free a roster slot", () => {
    expect(isOpenRosterStatus("eliminated")).toBe(true);
    expect(isOpenRosterStatus("withdrawn")).toBe(true);
    expect(isOpenRosterStatus("active")).toBe(false);
    expect(isOpenRosterStatus("winner")).toBe(false);
  });
});

describe("classifyRosterOccupancy", () => {
  const goneWeek3 = { status: "eliminated", eliminationWeek: 3 };

  it("treats a still-competing couple as occupied", () => {
    expect(classifyRosterOccupancy({ status: "active", eliminationWeek: null }, 4, null)).toBe(
      "occupied"
    );
  });

  it("hides an unrevealed elim so Recast cannot name them as out", () => {
    expect(classifyRosterOccupancy(goneWeek3, 2, null)).toBe("hidden-open");
    expect(classifyRosterOccupancy(goneWeek3, null, null)).toBe("hidden-open");
  });

  it("reveals the open slot at the cutoff week", () => {
    expect(classifyRosterOccupancy(goneWeek3, 3, null)).toBe("revealed-open");
    expect(classifyRosterOccupancy(goneWeek3, 4, null)).toBe("revealed-open");
  });

  it("treats withdrawn the same as eliminated", () => {
    expect(classifyRosterOccupancy({ status: "withdrawn", eliminationWeek: 2 }, 1, null)).toBe(
      "hidden-open"
    );
    expect(classifyRosterOccupancy({ status: "withdrawn", eliminationWeek: 2 }, 2, null)).toBe(
      "revealed-open"
    );
  });

  it("does not treat a podium finish as an open recast slot", () => {
    expect(classifyRosterOccupancy({ status: "winner", eliminationWeek: null }, 10, 10)).toBe(
      "occupied"
    );
  });
});

describe("partitionRecastSlots", () => {
  it("splits revealed vs hidden open slots and ignores occupied ones", () => {
    const slots = [
      { id: "a", status: "active", eliminationWeek: null },
      { id: "b", status: "eliminated", eliminationWeek: 2 },
      { id: "c", status: "eliminated", eliminationWeek: 4 },
    ];
    expect(partitionRecastSlots(slots, 3, null)).toEqual({
      revealedOpen: [{ id: "b", status: "eliminated", eliminationWeek: 2 }],
      hiddenOpenCount: 1,
    });
  });
});
