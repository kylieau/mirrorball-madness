import { describe, expect, it } from "vitest";
import {
  nextPredictedElimination,
  pinEliminatedFirst,
  pinnedEliminatedIds,
} from "./grand-finale-pins";

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

describe("nextPredictedElimination", () => {
  it("returns the first entry when nothing has been eliminated yet", () => {
    const couples = [couple("a", "active", null), couple("b", "active", null)];
    expect(nextPredictedElimination(["a", "b"], couples)).toBe("a");
  });

  it("skips entries already resolved and returns the first one still uncertain", () => {
    const couples = [couple("a", "eliminated", 1), couple("b", "active", null), couple("c", "active", null)];
    expect(nextPredictedElimination(["a", "b", "c"], couples)).toBe("b");
  });

  it("uses the same slot for every manager, not each bracket's first open couple", () => {
    // One couple is out, so the next slot is #2 in every bracket. This manager
    // guessed "b" to go first, but that slot has passed — their #2 is "c".
    const couples = [couple("a", "eliminated", 1), couple("b", "active", null), couple("c", "active", null)];
    expect(nextPredictedElimination(["b", "c", "a"], couples)).toBe("c");
  });

  it("falls back to an earlier open couple when nothing is left after the slot", () => {
    const couples = [couple("b", "active", null), couple("c", "eliminated", 1)];
    expect(nextPredictedElimination(["b", "c"], couples)).toBe("b");
  });

  it("returns null once the whole season is decided", () => {
    const couples = [couple("a", "eliminated", 1), couple("b", "winner", null)];
    expect(nextPredictedElimination(["a", "b"], couples)).toBeNull();
  });
});
