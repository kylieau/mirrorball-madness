import { describe, expect, it } from "vitest";
import { findPendingRevealEpisode } from "./spoiler-cutoff";

const e01 = { id: "ep-1", week_number: 1 };
const e02 = { id: "ep-2", week_number: 2 };
const e03 = { id: "ep-3", week_number: 3 };
const completedDesc = [e03, e02, e01];

describe("findPendingRevealEpisode", () => {
  it("is null when spoiler-free mode is off, even if weeks exist", () => {
    expect(findPendingRevealEpisode(false, 1, completedDesc)).toBeNull();
    expect(findPendingRevealEpisode(false, null, completedDesc)).toBeNull();
  });

  it("is null when there are no completed episodes", () => {
    expect(findPendingRevealEpisode(true, 0, [])).toBeNull();
  });

  it("returns the latest completed week when it is ahead of last_watched_week", () => {
    expect(findPendingRevealEpisode(true, 1, [e02, e01])).toEqual(e02);
    expect(findPendingRevealEpisode(true, 0, [e02, e01])).toEqual(e02);
    expect(findPendingRevealEpisode(true, 1, completedDesc)).toEqual(e03);
  });

  it("is still pending when older weeks are already visible", () => {
    expect(findPendingRevealEpisode(true, 1, [e02, e01])?.week_number).toBe(2);
  });

  it("is null once the viewer has marked through the latest completed week", () => {
    expect(findPendingRevealEpisode(true, 2, [e02, e01])).toBeNull();
    expect(findPendingRevealEpisode(true, 3, completedDesc)).toBeNull();
  });

  it("treats a missing progress row as week 0", () => {
    expect(findPendingRevealEpisode(true, null, [e01])).toEqual(e01);
  });
});
