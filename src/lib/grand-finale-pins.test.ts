import { describe, expect, it } from "vitest";
import { pinEliminatedFirst, pinnedEliminatedIds } from "./grand-finale-pins";

const couple = (id: string, status: string, week: number | null, name = id) => ({
  id,
  celebrity_name: name,
  status,
  elimination_week: week,
});

describe("pinnedEliminatedIds", () => {
  it("orders eliminated/withdrawn couples by week, then name, and skips active ones", () => {
    const ids = pinnedEliminatedIds([
      couple("a", "active", null),
      couple("b", "eliminated", 2, "Zed"),
      couple("c", "withdrawn", 1),
      couple("d", "eliminated", 2, "Amy"),
    ]);
    expect(ids).toEqual(["c", "d", "b"]);
  });

  it("returns nothing when no elimination is revealed", () => {
    expect(pinnedEliminatedIds([couple("a", "active", null)])).toEqual([]);
  });
});

describe("pinEliminatedFirst", () => {
  it("moves pinned couples to the front and keeps the rest in order", () => {
    expect(pinEliminatedFirst(["x", "p", "y", "q"], ["q", "p"])).toEqual(["q", "p", "x", "y"]);
  });

  it("is a no-op with nothing pinned", () => {
    expect(pinEliminatedFirst(["x", "y"], [])).toEqual(["x", "y"]);
  });
});
