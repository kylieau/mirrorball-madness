import { describe, expect, it } from "vitest";
import {
  formatAirDate,
  pickSeasonStripSlots,
  seasonStripAriaLabel,
  type SeasonStripEpisode,
} from "./season-strip";

function ep(
  week: number,
  status: SeasonStripEpisode["status"],
  extras: Partial<SeasonStripEpisode> = {}
): SeasonStripEpisode {
  return {
    id: `ep-${week}`,
    week_number: week,
    status,
    theme: extras.theme ?? `Theme ${week}`,
    airs_at: extras.airs_at ?? `2026-09-${String(8 + week * 7).padStart(2, "0")}T00:00:00Z`,
    ...extras,
  };
}

describe("pickSeasonStripSlots", () => {
  it("returns empty slots when the season has no episodes", () => {
    expect(pickSeasonStripSlots([])).toEqual({ justAired: null, upNext: null });
  });

  it("uses the latest completed week as Just aired, ignoring input order", () => {
    const e01 = ep(1, "completed");
    const e02 = ep(2, "completed");
    const e03 = ep(3, "upcoming");
    expect(pickSeasonStripSlots([e01, e03, e02])).toEqual({ justAired: e02, upNext: e03 });
  });

  it("treats a locked episode as Up next so lock-to-publish does not skip a week", () => {
    const e01 = ep(1, "completed");
    const e02 = ep(2, "locked");
    const e03 = ep(3, "upcoming");
    expect(pickSeasonStripSlots([e03, e02, e01])).toEqual({ justAired: e01, upNext: e02 });
  });

  it("shows only Up next before anything has completed", () => {
    const e01 = ep(1, "upcoming");
    expect(pickSeasonStripSlots([e01])).toEqual({ justAired: null, upNext: e01 });
  });

  it("shows only Just aired after the finale is completed", () => {
    const e11 = ep(11, "completed");
    expect(pickSeasonStripSlots([e11])).toEqual({ justAired: e11, upNext: null });
  });
});

describe("formatAirDate", () => {
  it("prints the show-night calendar date in US Eastern, not UTC", () => {
    // Tuesday 8pm EDT = Wednesday 00:00 UTC. Must still read as Tuesday.
    expect(formatAirDate("2026-09-16T00:00:00.000Z")).toBe("Tue, Sep 15");
  });

  it("keeps an Eastern-midnight instant on that same calendar day", () => {
    expect(formatAirDate("2026-09-15T04:00:00.000Z")).toBe("Tue, Sep 15");
  });
});

describe("seasonStripAriaLabel", () => {
  it("names both slots and the This Week destination", () => {
    expect(
      seasonStripAriaLabel({
        justAired: ep(2, "completed", { theme: "Latin Night" }),
        upNext: ep(3, "upcoming", { theme: "Disney" }),
      })
    ).toBe("Just aired Ep. 2 — Latin Night. Up next Ep. 3 — Disney. Open This Week");
  });

  it("omits a missing slot", () => {
    expect(seasonStripAriaLabel({ justAired: ep(1, "completed", { theme: null }), upNext: null })).toBe(
      "Just aired Ep. 1. Open This Week"
    );
  });
});
