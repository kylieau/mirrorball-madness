import { describe, expect, it } from "vitest";
import { judgesScoreMultiplierHelp, judgesScoreMultiplierLocked } from "./judges-score-multiplier";

describe("judgesScoreMultiplierLocked", () => {
  it("stays open before and during the draft", () => {
    expect(judgesScoreMultiplierLocked("not_started")).toBe(false);
    expect(judgesScoreMultiplierLocked("in_progress")).toBe(false);
  });

  it("locks once the draft is complete", () => {
    expect(judgesScoreMultiplierLocked("completed")).toBe(true);
  });
});

describe("judgesScoreMultiplierHelp", () => {
  it("tells a commissioner they can still edit before the draft is over", () => {
    expect(judgesScoreMultiplierHelp("not_started")).toMatch(/draft starts/i);
    expect(judgesScoreMultiplierHelp("in_progress")).toMatch(/until the draft is complete/i);
  });

  it("says the field is locked after the draft is complete", () => {
    expect(judgesScoreMultiplierHelp("completed")).toMatch(/locked/i);
    expect(judgesScoreMultiplierHelp("completed")).toMatch(/draft is complete/i);
  });
});
