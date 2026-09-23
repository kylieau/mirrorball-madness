import { describe, expect, it } from "vitest";
import { fanOutcomeBadge } from "./results-outcome";

describe("fanOutcomeBadge", () => {
  it("replaces Safe with In Jeopardy when the couple was marked", () => {
    expect(fanOutcomeBadge("safe", true).label).toBe("In Jeopardy");
    expect(fanOutcomeBadge("safe", false).label).toBe("Safe");
  });

  it("keeps Eliminated when a couple is both eliminated and marked", () => {
    expect(fanOutcomeBadge("eliminated", true).label).toBe("Eliminated");
  });

  it("does not relabel a bye, withdrawal, or podium finish", () => {
    expect(fanOutcomeBadge("bye", true).label).toBe("DND");
    expect(fanOutcomeBadge("withdrawn", true).label).toBe("Withdrew");
    expect(fanOutcomeBadge("winner", true).label).toBe("Winner");
  });
});
