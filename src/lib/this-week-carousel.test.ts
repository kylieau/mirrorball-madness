import { describe, expect, it } from "vitest";
import {
  adjacentThisWeekWeeks,
  buildThisWeekCarouselWeeks,
  pastPicksHref,
  rosterWeekHref,
  selectThisWeekEpisode,
  thisWeekHref,
  type ThisWeekCarouselEpisode,
} from "./this-week-carousel";

function ep(
  week: number,
  status: ThisWeekCarouselEpisode["status"],
  extras: Partial<ThisWeekCarouselEpisode> = {}
): ThisWeekCarouselEpisode {
  return {
    id: `ep-${week}`,
    week_number: week,
    status,
    theme: extras.theme ?? `Theme ${week}`,
    ...extras,
  };
}

describe("buildThisWeekCarouselWeeks", () => {
  const e01 = ep(1, "completed");
  const e02 = ep(2, "completed");
  const e03 = ep(3, "upcoming");
  const e04 = ep(4, "locked");

  it("orders by week_number ascending without mutating the input", () => {
    const input = [e03, e01, e02];
    const visible = new Set(["ep-1", "ep-2"]);
    expect(buildThisWeekCarouselWeeks(input, visible).map((e) => e.week_number)).toEqual([1, 2, 3]);
    expect(input.map((e) => e.week_number)).toEqual([3, 1, 2]);
  });

  it("includes visible completed weeks and not-yet-completed weeks", () => {
    const visible = new Set(["ep-1", "ep-2"]);
    expect(buildThisWeekCarouselWeeks([e01, e02, e03, e04], visible).map((e) => e.id)).toEqual([
      "ep-1",
      "ep-2",
      "ep-3",
      "ep-4",
    ]);
  });

  it("omits unwatched completed weeks so spoiler cutoff cannot leak via ?week=", () => {
    const visible = new Set(["ep-1"]);
    expect(buildThisWeekCarouselWeeks([e01, e02, e03], visible).map((e) => e.id)).toEqual(["ep-1", "ep-3"]);
  });

  it("keeps upcoming and locked weeks when nothing completed is visible yet", () => {
    expect(buildThisWeekCarouselWeeks([e01, e03], new Set()).map((e) => e.id)).toEqual(["ep-3"]);
  });
});

describe("selectThisWeekEpisode", () => {
  const e01 = ep(1, "completed");
  const e02 = ep(2, "completed");
  const e03 = ep(3, "upcoming");
  const weeks = [e01, e02, e03];

  it("is empty when the carousel has no weeks", () => {
    expect(selectThisWeekEpisode([])).toEqual({ episode: null, mode: null });
  });

  it("honors a week param that is on the carousel", () => {
    expect(selectThisWeekEpisode(weeks, "ep-1")).toEqual({ episode: e01, mode: "results" });
    expect(selectThisWeekEpisode(weeks, "ep-3")).toEqual({ episode: e03, mode: "peek" });
  });

  it("treats locked the same as upcoming — theme peek, not results", () => {
    const locked = ep(3, "locked");
    expect(selectThisWeekEpisode([e01, locked], "ep-3")).toEqual({ episode: locked, mode: "peek" });
  });

  it("falls back to the latest completed week when the param is missing or unknown", () => {
    expect(selectThisWeekEpisode(weeks, null)).toEqual({ episode: e02, mode: "results" });
    expect(selectThisWeekEpisode(weeks, "nope")).toEqual({ episode: e02, mode: "results" });
    expect(selectThisWeekEpisode(weeks, "ep-2-unwatched")).toEqual({ episode: e02, mode: "results" });
  });

  it("defaults to the first peek week before anything has completed", () => {
    const upcoming = [ep(2, "upcoming"), ep(1, "upcoming")];
    const sorted = buildThisWeekCarouselWeeks(upcoming, new Set());
    expect(selectThisWeekEpisode(sorted, null)).toEqual({ episode: sorted[0], mode: "peek" });
  });
});

describe("adjacentThisWeekWeeks", () => {
  const weeks = [ep(1, "completed"), ep(2, "completed"), ep(3, "upcoming")];

  it("returns prev and next by carousel order", () => {
    expect(adjacentThisWeekWeeks(weeks, "ep-2")).toEqual({ prev: weeks[0], next: weeks[2] });
  });

  it("is null on the open side at the ends", () => {
    expect(adjacentThisWeekWeeks(weeks, "ep-1")).toEqual({ prev: null, next: weeks[1] });
    expect(adjacentThisWeekWeeks(weeks, "ep-3")).toEqual({ prev: weeks[1], next: null });
  });

  it("is empty when the current id is not on the carousel", () => {
    expect(adjacentThisWeekWeeks(weeks, "missing")).toEqual({ prev: null, next: null });
  });
});

describe("thisWeekHref", () => {
  it("flips This Week via ?week=", () => {
    expect(thisWeekHref("ep-2")).toBe("/this-week?week=ep-2");
  });
});

describe("pastPicksHref", () => {
  it("flips Past picks via ?tab=yourpicks&week=", () => {
    expect(pastPicksHref("league-1", "ep-2")).toBe("/leagues/league-1?tab=yourpicks&week=ep-2");
  });
});

describe("Your Picks carousel hrefs keep each other's position", () => {
  it("pastPicksHref carries the roster week when there is one", () => {
    expect(pastPicksHref("l", "ep-2", "w-1")).toBe("/leagues/l?tab=yourpicks&week=ep-2&rosterWeek=w-1");
  });

  it("rosterWeekHref carries the Curtain Call week when there is one", () => {
    expect(rosterWeekHref("l", "w-3")).toBe("/leagues/l?tab=yourpicks&rosterWeek=w-3");
    expect(rosterWeekHref("l", "w-3", "ep-2")).toBe("/leagues/l?tab=yourpicks&rosterWeek=w-3&week=ep-2");
  });
});

describe("selectThisWeekEpisode with a revealing week", () => {
  const weeks = [
    { id: "w1", week_number: 1, theme: null, status: "completed" },
    { id: "w2", week_number: 2, theme: null, status: "upcoming" },
  ];

  it("lands on the revealing week in scores mode when the viewer may see it", () => {
    expect(selectThisWeekEpisode(weeks, null, "w2")).toMatchObject({ episode: { id: "w2" }, mode: "scores" });
  });

  it("keeps a plain peek and the latest completed default when it is hidden", () => {
    expect(selectThisWeekEpisode(weeks, null, null)).toMatchObject({ episode: { id: "w1" }, mode: "results" });
    expect(selectThisWeekEpisode(weeks, "w2", null)).toMatchObject({ episode: { id: "w2" }, mode: "peek" });
  });
});
