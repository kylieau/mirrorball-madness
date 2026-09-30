import { describe, expect, it } from "vitest";
import { buildLivePromptState, buildSpoilerFreeStripState } from "./spoiler-free-strip-state";
import type { LiveAirPhase } from "./episode-banner";

const base = {
  spoilerFreeMode: true,
  lastWatchedWeek: 2,
  completedWeekNumbers: [1, 2],
  revealingWeekNumber: null as number | null,
  pendingRevealWeekNumber: null as number | null,
  draftReleaseWeekNumber: null as number | null,
  draftNightActive: false,
  draftUnlockedWeek: 0,
  latestRelease: null as string | null,
  livePhase: null as LiveAirPhase | null,
};

describe("buildSpoilerFreeStripState", () => {
  it("has no ready strip when Spoiler-Free is off", () => {
    expect(buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, pendingRevealWeekNumber: 3 })).toBeNull();
  });

  it("still offers a posting week with Spoiler-Free off, without the Spoiler-Free label or earlier weeks", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, lastWatchedWeek: 0, revealingWeekNumber: 3 })
    ).toEqual({ kind: "posting", weekNumber: 3, earlierWeeks: [], spoilerFree: false, stayUnlocksDrafts: false, liveCoast: null });
  });

  it("has no watching strip with Spoiler-Free off", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, spoilerFreeMode: false, lastWatchedWeek: 3, revealingWeekNumber: 3 })
    ).toBeNull();
  });

  it.each([true, false])(
    "offers Draft scores available whenever drafts are out and the viewer hasn't opted in (Spoiler-Free %s)",
    (spoilerFreeMode) => {
      const drafts = { ...base, spoilerFreeMode, draftReleaseWeekNumber: 3, latestRelease: "Tatyana & Jan" };
      const expected = { kind: "draft_gap", weekNumber: 3, latest: "Tatyana & Jan", spoilerFree: spoilerFreeMode, liveCoast: null };
      expect(buildSpoilerFreeStripState(drafts)).toEqual(expected);
      expect(buildSpoilerFreeStripState({ ...drafts, livePhase: { kind: "east", weekNumber: 3 } })).toEqual({
        ...expected,
        liveCoast: "east",
      });
      expect(buildSpoilerFreeStripState({ ...drafts, livePhase: { kind: "gap", weekNumber: 3 } })).toEqual(expected);
    }
  );

  it("gives a West Stay Updated viewer (published only) the posting strip, whose Stay Updated unlocks drafts", () => {
    expect(buildSpoilerFreeStripState({ ...base, draftReleaseWeekNumber: 3, lastWatchedWeek: 3 })).toEqual({
      kind: "posting",
      weekNumber: 3,
      earlierWeeks: [],
      spoilerFree: true,
      stayUnlocksDrafts: true,
      liveCoast: null,
    });
  });

  it("drops the draft strips once drafts are unlocked", () => {
    const unlocked = { ...base, draftReleaseWeekNumber: 3, lastWatchedWeek: 3, draftUnlockedWeek: 3 };
    expect(buildSpoilerFreeStripState(unlocked)).toEqual({ kind: "watching", weekNumber: 3 });
    expect(buildSpoilerFreeStripState({ ...unlocked, draftNightActive: true })).toBeNull();
  });

  it("follows published scores only from a live couple's posting strip outside East, drafts during East", () => {
    const live = { ...base, revealingWeekNumber: 3 };
    expect(buildSpoilerFreeStripState(live)).toMatchObject({ kind: "posting", stayUnlocksDrafts: false, liveCoast: null });
    expect(buildSpoilerFreeStripState({ ...live, livePhase: { kind: "east", weekNumber: 3 } })).toMatchObject({ stayUnlocksDrafts: true });
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
      stayUnlocksDrafts: false,
      liveCoast: null,
    });
  });

  it("is posting when a week is mid-reveal, taking priority over a merely-pending one", () => {
    expect(
      buildSpoilerFreeStripState({ ...base, revealingWeekNumber: 3, pendingRevealWeekNumber: 4 })
    ).toEqual({ kind: "posting", weekNumber: 3, earlierWeeks: [], spoilerFree: true, stayUnlocksDrafts: false, liveCoast: null });
  });

  it("carries earlier unmarked completed weeks alongside the strip week", () => {
    expect(
      buildSpoilerFreeStripState({
        ...base,
        lastWatchedWeek: 0,
        completedWeekNumbers: [1, 2],
        pendingRevealWeekNumber: 3,
      })
    ).toEqual({ kind: "ready", weekNumber: 3, earlierWeeks: [1, 2], spoilerFree: true, stayUnlocksDrafts: false, liveCoast: null });
  });

  it("is watching when a revealing week is behind the viewer, even though revealing isn't visible to them yet", () => {
    expect(buildSpoilerFreeStripState({ ...base, revealingWeekNumber: 3, lastWatchedWeek: 3 })).toEqual({
      kind: "watching",
      weekNumber: 3,
    });
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
