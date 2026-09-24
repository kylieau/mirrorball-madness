import { describe, expect, it } from "vitest";
import {
  computeEpisodeBannerState,
  nextBannerRefreshMs,
  seasonTrack,
  type BannerEpisode,
  type BannerWeek,
  type EpisodeBannerInput,
} from "./episode-banner";

// 8pm ET Tuesday Sept 22, 2026 = 00:00Z Sept 23 = 5pm PT; a 2h show ends 7pm PT.
const AIRS = "2026-09-23T00:00:00Z";
const at = (iso: string) => new Date(iso);
const HOUR = 3600_000;

function episode(overrides: Partial<BannerEpisode> = {}): BannerEpisode {
  return { airsAt: AIRS, durationMinutes: 120, completed: false, publishedAt: null, ...overrides };
}

function input(weeks: BannerWeek[], overrides: Partial<EpisodeBannerInput> = {}): EpisodeBannerInput {
  return { weeks, picksModuleOn: true, curtainCallLockAtIso: "2026-09-22T20:00:00Z", ...overrides };
}

const live = (episodes = [episode()]): BannerWeek => ({ weekNumber: 2, episodes });

describe("computeEpisodeBannerState", () => {
  it("hides with no weeks, or a live week with nothing scheduled", () => {
    expect(computeEpisodeBannerState(input([]), at("2026-09-22T12:00:00Z"))).toBeNull();
    expect(computeEpisodeBannerState(input([live([])]), at("2026-09-22T12:00:00Z"))).toBeNull();
  });

  it("is picks_open before lock", () => {
    expect(computeEpisodeBannerState(input([live()]), at("2026-09-22T12:00:00Z"))).toEqual({
      kind: "picks_open",
      weekNumber: 2,
      airsAtIso: AIRS,
      picksModuleOn: true,
    });
  });

  it("is picks_locked between the Curtain Call lock and air time", () => {
    expect(computeEpisodeBannerState(input([live()]), at("2026-09-22T22:00:00Z"))).toEqual({
      kind: "picks_locked",
      weekNumber: 2,
      airsAtIso: AIRS,
    });
  });

  it("never shows picks_locked when Curtain Call is off", () => {
    const state = computeEpisodeBannerState(
      input([live()], { picksModuleOn: false, curtainCallLockAtIso: null }),
      at("2026-09-22T22:00:00Z")
    );
    expect(state).toMatchObject({ kind: "picks_open", picksModuleOn: false });
  });

  it("is on_air for the episode's duration", () => {
    expect(computeEpisodeBannerState(input([live()]), at("2026-09-23T01:00:00Z"))).toEqual({
      kind: "on_air",
      weekNumber: 2,
      picksModuleOn: true,
    });
  });

  it("honors a custom duration", () => {
    const week = live([episode({ durationMinutes: 180 })]);
    expect(computeEpisodeBannerState(input([week]), at("2026-09-23T02:30:00Z"))).toMatchObject({ kind: "on_air" });
  });

  it("is results_soon after the air window until published", () => {
    const state = computeEpisodeBannerState(input([live([episode({ airsAt: "2026-09-22T00:00:00Z" })])]), at("2026-09-23T10:00:00Z"));
    expect(state).toEqual({ kind: "results_soon", weekNumber: 2 });
  });

  it("holds results_in after a week completes, then advances 48h before the next air", () => {
    const done: BannerWeek = {
      weekNumber: 1,
      episodes: [episode({ airsAt: "2026-09-16T00:00:00Z", completed: true, publishedAt: "2026-09-16T02:00:00Z" })],
    };
    const next = live([episode({ airsAt: "2026-09-23T00:00:00Z" })]);
    expect(computeEpisodeBannerState(input([done, next]), at("2026-09-19T12:00:00Z"))).toEqual({
      kind: "results_in",
      weekNumber: 1,
    });
    expect(computeEpisodeBannerState(input([done, next]), at("2026-09-21T01:00:00Z"))).toMatchObject({
      kind: "picks_open",
      weekNumber: 2,
    });
  });

  it("skips the hold when the next episode is under 48h after the publish", () => {
    const done: BannerWeek = {
      weekNumber: 1,
      episodes: [episode({ airsAt: "2026-09-21T00:00:00Z", completed: true, publishedAt: "2026-09-22T00:00:00Z" })],
    };
    expect(computeEpisodeBannerState(input([done, live()]), at("2026-09-22T12:00:00Z"))).toMatchObject({
      kind: "picks_open",
    });
  });

  it("follows the second night once the first is published", () => {
    const night2 = episode({ airsAt: "2026-09-30T00:00:00Z" });
    const night1 = episode({ airsAt: "2026-09-23T00:00:00Z", completed: true, publishedAt: "2026-09-23T02:00:00Z" });
    const prior: BannerWeek = {
      weekNumber: 1,
      episodes: [episode({ airsAt: "2026-09-16T00:00:00Z", completed: true, publishedAt: "2026-09-16T02:00:00Z" })],
    };
    // The week's picks lock at the first night, so the second night reads locked.
    expect(computeEpisodeBannerState(input([prior, live([night1, night2])]), at("2026-09-25T12:00:00Z"))).toEqual({
      kind: "picks_locked",
      weekNumber: 2,
      airsAtIso: night2.airsAt,
    });
  });

  it("shows results_soon when only the first night has aired", () => {
    const week = live([episode({ airsAt: "2026-09-23T00:00:00Z" }), episode({ airsAt: "2026-09-30T00:00:00Z" })]);
    expect(computeEpisodeBannerState(input([week]), at("2026-09-23T10:00:00Z"))).toEqual({
      kind: "results_soon",
      weekNumber: 2,
    });
  });

  describe("West feed", () => {
    it("bridges from the East end to 8pm PT, then reads watching until 10pm PT", () => {
      const weeks = [live()];
      expect(computeEpisodeBannerState(input(weeks), at("2026-09-23T02:30:00Z"))).toEqual({
        kind: "west_soon",
        weekNumber: 2,
      });
      expect(computeEpisodeBannerState(input(weeks), at("2026-09-23T03:30:00Z"))).toEqual({
        kind: "west_watching",
        weekNumber: 2,
      });
      expect(computeEpisodeBannerState(input(weeks), at("2026-09-23T05:30:00Z"))).toEqual({
        kind: "results_soon",
        weekNumber: 2,
      });
    });

    it("wins over an already-published Results in", () => {
      const done: BannerWeek = {
        weekNumber: 2,
        episodes: [episode({ completed: true, publishedAt: "2026-09-23T02:00:00Z" })],
      };
      const next: BannerWeek = { weekNumber: 3, episodes: [episode({ airsAt: "2026-09-30T00:00:00Z" })] };
      expect(computeEpisodeBannerState(input([done, next]), at("2026-09-23T03:30:00Z"))).toEqual({
        kind: "west_watching",
        weekNumber: 2,
      });
      expect(computeEpisodeBannerState(input([done, next]), at("2026-09-23T06:00:00Z"))).toEqual({
        kind: "results_in",
        weekNumber: 2,
      });
    });

    it("handles standard time", () => {
      const winter = "2026-12-02T01:00:00Z"; // 8pm ET = 5pm PST
      const week = live([episode({ airsAt: winter })]);
      expect(computeEpisodeBannerState(input([week]), at("2026-12-02T03:30:00Z"))).toMatchObject({
        kind: "west_soon",
      });
      expect(computeEpisodeBannerState(input([week]), at("2026-12-02T04:30:00Z"))).toMatchObject({
        kind: "west_watching",
      });
    });
  });

  describe("season over", () => {
    const final: BannerWeek = {
      weekNumber: 9,
      episodes: [episode({ airsAt: "2026-11-25T01:00:00Z", completed: true, publishedAt: "2026-11-25T04:00:00Z" })],
    };

    it("keeps results_in for a week after the final publish, then drops", () => {
      expect(computeEpisodeBannerState(input([final]), at("2026-12-01T12:00:00Z"))).toEqual({
        kind: "results_in",
        weekNumber: 9,
      });
      expect(computeEpisodeBannerState(input([final]), at("2026-12-03T12:00:00Z"))).toBeNull();
    });
  });
});

describe("nextBannerRefreshMs", () => {
  const weeks = [live()];

  it("ticks every minute within 6 hours either side of air time", () => {
    expect(nextBannerRefreshMs(weeks, new Date(at(AIRS).getTime() - 5 * HOUR))).toBe(60_000);
    expect(nextBannerRefreshMs(weeks, new Date(at(AIRS).getTime() + 5 * HOUR))).toBe(60_000);
  });

  it("otherwise waits a day, or until the window opens if that is sooner", () => {
    expect(nextBannerRefreshMs(weeks, new Date(at(AIRS).getTime() - 5 * 24 * HOUR))).toBe(24 * HOUR);
    expect(nextBannerRefreshMs(weeks, new Date(at(AIRS).getTime() - 10 * HOUR))).toBe(4 * HOUR);
    expect(nextBannerRefreshMs(weeks, new Date(at(AIRS).getTime() + 30 * HOUR))).toBe(24 * HOUR);
  });
});

describe("seasonTrack", () => {
  const done = (weekNumber: number): BannerWeek => ({
    weekNumber,
    episodes: [episode({ completed: true, publishedAt: AIRS })],
  });
  const upcoming = (weekNumber: number): BannerWeek => ({ weekNumber, episodes: [episode()] });

  it("checks earlier weeks and glows the banner's own week", () => {
    const weeks = [done(1), upcoming(2), upcoming(3)];
    expect(seasonTrack(weeks, { kind: "on_air", weekNumber: 2, picksModuleOn: true })).toEqual({
      weeksDone: 1,
      currentWeek: 2,
      upNext: false,
    });
  });

  it("checks a fully published week and moves the circle to the next week, up next", () => {
    const weeks = [done(1), done(2), upcoming(3)];
    expect(seasonTrack(weeks, { kind: "results_in", weekNumber: 2 })).toEqual({
      weeksDone: 2,
      currentWeek: 3,
      upNext: true,
    });
  });

  it("has no glowing circle once the season is over", () => {
    expect(seasonTrack([done(1), done(2)], { kind: "results_in", weekNumber: 2 })).toEqual({
      weeksDone: 2,
      currentWeek: null,
      upNext: true,
    });
  });
});
