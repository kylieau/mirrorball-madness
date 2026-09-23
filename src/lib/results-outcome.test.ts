import { describe, expect, it } from "vitest";
import { fanOutcomeBadge, showInJeopardyBadge } from "./results-outcome";

describe("fanOutcomeBadge", () => {
  it("labels a plain outcome regardless of any In Jeopardy mark", () => {
    expect(fanOutcomeBadge("safe").label).toBe("Safe");
    expect(fanOutcomeBadge("eliminated").label).toBe("Eliminated");
    expect(fanOutcomeBadge("bye").label).toBe("DND");
    expect(fanOutcomeBadge("withdrawn").label).toBe("Withdrew");
    expect(fanOutcomeBadge("winner").label).toBe("Winner");
  });
});

describe("showInJeopardyBadge", () => {
  it("shows alongside Safe only, additive rather than a replacement", () => {
    expect(showInJeopardyBadge("safe", true)).toBe(true);
    expect(showInJeopardyBadge("safe", false)).toBe(false);
  });

  it("never shows for eliminated or any other terminal outcome", () => {
    expect(showInJeopardyBadge("eliminated", true)).toBe(false);
    expect(showInJeopardyBadge("bye", true)).toBe(false);
    expect(showInJeopardyBadge("withdrawn", true)).toBe(false);
    expect(showInJeopardyBadge("winner", true)).toBe(false);
  });
});
