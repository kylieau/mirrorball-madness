import { describe, expect, it } from "vitest";
import { buildLivePromptState, buildSpoilerFreeStripState } from "./spoiler-free-strip-state";

const base = {
  spoilerFreeMode: true,
  lastWatchedWeek: 2,
  completedWeekNumbers: [1, 2],
  revealingWeekNumber: null as number | null,
  pendingRevealWeekNumber: null as number | null,
  draftReleaseWeekNumber: null as number | null,
  draftNightActive: false,
  draftUnlockedWeek: 0,
  draftWeekEastEnded: false,
  latestReleasedCouple: null as string | null,
  eastLiveWeekNumber: null as number | null,
};

describe("buildSpoilerFreeStripState", () => {
  it("has no ready strip when Spoiler-Free is off", () => {
    expect(buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, pendingRevealWeekNumber: 3 })).toBeNull();
  });

  it("still offers a posting week with Spoiler-Free off, without the Spoiler-Free label or earlier weeks", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, lastWatchedWeek: 0, revealingWeekNumber: 3 })
    ).toEqual({ kind: "posting", weekNumber: 3, earlierWeeks: [], spoilerFree: false, eastLive: false });
  });

  it("has no watching strip with Spoiler-Free off", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, lastWatchedWeek: 3, revealingWeekNumber: 3 })
    ).toBeNull();
  });

  it.each([true, false])(
    "offers Follow along after the East broadcast while drafts are ahead (Spoiler-Free %s)",
    (spoilerFreeMode) => {
      expect(
        buildSpoilerFreeStripState({
          ...base,
          spoilerFreeMode,
          draftReleaseWeekNumber: 3,
          draftWeekEastEnded: true,
          latestReleasedCouple: "Tatyana & Jan",
        })
      ).toEqual({ kind: "draft_gap", weekNumber: 3, latestCouple: "Tatyana & Jan" });
    }
  );

  it("keeps the posting strip during the East broadcast, offering Stay Updated instead of Mark Watched", () => {
    expect(buildSpoilerFreeStripState({ ...base, draftReleaseWeekNumber: 3, eastLiveWeekNumber: 3 })).toMatchObject({
      kind: "posting",
      eastLive: true,
    });
    expect(buildSpoilerFreeStripState({ ...base, draftReleaseWeekNumber: 3 })).toMatchObject({ eastLive: false });
  });

  it("drops Follow along once the viewer chose Stay Updated or unlocked drafts", () => {
    const gap = { ...base, draftReleaseWeekNumber: 3, draftWeekEastEnded: true };
    expect(buildSpoilerFreeStripState({ ...gap, lastWatchedWeek: 3 })).toEqual({ kind: "watching", weekNumber: 3 });
    expect(buildSpoilerFreeStripState({ ...gap, draftUnlockedWeek: 3 })).toMatchObject({ kind: "posting" });
  });

  it("returns null when the viewer is fully caught up", () => {
    expect(buildSpoilerFreeStripState(base)).toBeNull();
  });

  it("is ready when a week is fully resolved and pending reveal", () => {
    expect(buildSpoilerFreeStripState({ ...base, pendingRevealWeekNumber: 3 })).toEqual({
      kind: "ready",
      weekNumber: 3,
      earlierWeeks: [],
      spoilerFree: true,
      eastLive: false,
    });
  });

  it("is posting when a week is mid-reveal, taking priority over a merely-pending one", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, revealingWeekNumber: 3, pendingRevealWeekNumber: 4 })
    ).toEqual({ kind: "posting", weekNumber: 3, earlierWeeks: [], spoilerFree: true, eastLive: false });
  });

  it("is posting when a draft is released ahead of the last watched week", () => {
    expect(buildSpoilerFreeStripState({ ...base, draftReleaseWeekNumber: 3 })).toEqual({
      kind: "posting",
      weekNumber: 3,
      earlierWeeks: [],
      spoilerFree: true,
      eastLive: false,
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
    ).toEqual({ kind: "ready", weekNumber: 3, earlierWeeks: [1, 2], spoilerFree: true, eastLive: false });
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

describe("buildLivePromptState", () => {
  const prompt = {
    phase: { kind: "east" as const, weekNumber: 3 },
    lastWatchedWeek: 2,
    draftUnlockedWeek: 2,
    revealingWeekNumber: null as number | null,
    draftReleaseWeekNumber: 3 as number | null,
  };

  it("prompts in the East window once a draft for that week is out", () => {
    expect(buildLivePromptState(prompt)).toEqual({ coast: "east", weekNumber: 3 });
  });

  it("waits for the first posted score", () => {
    expect(buildLivePromptState({ ...prompt, draftReleaseWeekNumber: null })).toBeNull();
  });

  it("never prompts before the curtain, in the ET-to-PT gap, or after the night", () => {
    expect(buildLivePromptState({ ...prompt, phase: null })).toBeNull();
    expect(buildLivePromptState({ ...prompt, phase: { kind: "gap", weekNumber: 3 } })).toBeNull();
  });

  it("skips East viewers who already unlocked drafts", () => {
    expect(buildLivePromptState({ ...prompt, draftUnlockedWeek: 3 })).toBeNull();
  });

  it("prompts in the West window on a live couple, unless the viewer already opted in", () => {
    const west = { ...prompt, phase: { kind: "west" as const, weekNumber: 3 }, draftReleaseWeekNumber: null, revealingWeekNumber: 3 };
    expect(buildLivePromptState(west)).toEqual({ coast: "west", weekNumber: 3 });
    expect(buildLivePromptState({ ...west, lastWatchedWeek: 3 })).toBeNull();
  });
});
