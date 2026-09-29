import { describe, expect, it } from "vitest";
import { buildSpoilerFreeStripState } from "./spoiler-free-strip-state";

const base = {
  spoilerFreeMode: true,
  lastWatchedWeek: 2,
  completedWeekNumbers: [1, 2],
  revealingWeekNumber: null as number | null,
  pendingRevealWeekNumber: null as number | null,
  draftReleaseWeekNumber: null as number | null,
  draftNightActive: false,
};

describe("buildSpoilerFreeStripState", () => {
  it("returns null when Spoiler-Free is off", () => {
    expect(buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, pendingRevealWeekNumber: 3 })).toBeNull();
  });

  it("returns null when the viewer is fully caught up", () => {
    expect(buildSpoilerFreeStripState(base)).toBeNull();
  });

  it("is ready when a week is fully resolved and pending reveal", () => {
    expect(buildSpoilerFreeStripState({ ...base, pendingRevealWeekNumber: 3 })).toEqual({
      kind: "ready",
      weekNumber: 3,
      earlierWeeks: [],
    });
  });

  it("is posting when a week is mid-reveal, taking priority over a merely-pending one", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, revealingWeekNumber: 3, pendingRevealWeekNumber: 4 })
    ).toEqual({ kind: "posting", weekNumber: 3, earlierWeeks: [] });
  });

  it("is posting when a draft is released ahead of the last watched week", () => {
    expect(buildSpoilerFreeStripState({ ...base, draftReleaseWeekNumber: 3 })).toEqual({
      kind: "posting",
      weekNumber: 3,
      earlierWeeks: [],
    });
  });

  it("carries earlier unmarked completed weeks alongside the strip week", () => {
    expect(
      buildSpoilerFreeStripState({
        ...base,
        lastWatchedWeek: 0,
        completedWeekNumbers: [1, 2],
        pendingRevealWeekNumber: 3,
      })
    ).toEqual({ kind: "ready", weekNumber: 3, earlierWeeks: [1, 2] });
  });

  it("is watching when a revealing week is behind the viewer, even though revealing isn't visible to them yet", () => {
    expect(buildSpoilerFreeStripState({ ...base, revealingWeekNumber: 3, lastWatchedWeek: 3 })).toEqual({
      kind: "watching",
      weekNumber: 3,
    });
  });

  it("is watching when caught up to a released draft with no live draft night", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, lastWatchedWeek: 3, draftReleaseWeekNumber: 3, draftNightActive: false })
    ).toEqual({ kind: "watching", weekNumber: 3 });
  });

  it("stays null when caught up to a released draft that still has a live draft night", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, lastWatchedWeek: 3, draftReleaseWeekNumber: 3, draftNightActive: true })
    ).toBeNull();
  });
});
