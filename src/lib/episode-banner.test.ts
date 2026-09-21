import { describe, expect, it } from "vitest";
import { computeEpisodeBannerState } from "./episode-banner";

const NOW = new Date("2026-09-22T12:00:00Z");
const FUTURE = "2026-09-23T00:00:00Z";
const PAST = "2026-09-21T00:00:00Z";

function week(episodes: { status: string; airs_at: string }[]) {
  return { week_number: 2, earliestAirsAt: episodes[0]?.airs_at ?? null, episodes };
}

describe("computeEpisodeBannerState", () => {
  it("hides when there is no live week", () => {
    expect(computeEpisodeBannerState({ liveWeek: null, picksModuleOn: true, now: NOW })).toBeNull();
  });

  it("hides when the live week has no episodes scheduled", () => {
    expect(computeEpisodeBannerState({ liveWeek: week([]), picksModuleOn: true, now: NOW })).toBeNull();
  });

  it("is picks_open before any episode airs", () => {
    expect(
      computeEpisodeBannerState({
        liveWeek: week([{ status: "upcoming", airs_at: FUTURE }]),
        picksModuleOn: true,
        now: NOW,
      })
    ).toEqual({ kind: "picks_open", weekNumber: 2, airsAtIso: FUTURE, picksModuleOn: true });
  });

  it("is on_air once a non-completed episode's air time has passed", () => {
    expect(
      computeEpisodeBannerState({
        liveWeek: week([{ status: "upcoming", airs_at: PAST }]),
        picksModuleOn: true,
        now: NOW,
      })
    ).toEqual({ kind: "on_air", weekNumber: 2, picksModuleOn: true });
  });

  it("stays picks_open when the aired night is already completed and the next hasn't aired", () => {
    const state = computeEpisodeBannerState({
      liveWeek: week([
        { status: "completed", airs_at: PAST },
        { status: "upcoming", airs_at: FUTURE },
      ]),
      picksModuleOn: true,
      now: NOW,
    });
    expect(state?.kind).toBe("picks_open");
  });

  it("carries picksModuleOn through both states", () => {
    expect(
      computeEpisodeBannerState({
        liveWeek: week([{ status: "upcoming", airs_at: FUTURE }]),
        picksModuleOn: false,
        now: NOW,
      })
    ).toMatchObject({ kind: "picks_open", picksModuleOn: false });
    expect(
      computeEpisodeBannerState({
        liveWeek: week([{ status: "upcoming", airs_at: PAST }]),
        picksModuleOn: false,
        now: NOW,
      })
    ).toMatchObject({ kind: "on_air", picksModuleOn: false });
  });
});
