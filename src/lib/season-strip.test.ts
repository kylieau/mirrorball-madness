import { describe, expect, it } from "vitest";
import {
  defaultSeasonStripIndex,
  formatAirDate,
  seasonStripKicker,
  sortSeasonEpisodes,
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

describe("sortSeasonEpisodes", () => {
  it("orders by week_number ascending without mutating the input", () => {
    const e01 = ep(1, "completed");
    const e03 = ep(3, "upcoming");
    const e02 = ep(2, "completed");
    const input = [e03, e01, e02];
    expect(sortSeasonEpisodes(input).map((e) => e.week_number)).toEqual([1, 2, 3]);
    expect(input.map((e) => e.week_number)).toEqual([3, 1, 2]);
  });
});

describe("defaultSeasonStripIndex", () => {
  it("is 0 when the season has no episodes", () => {
    expect(defaultSeasonStripIndex([])).toBe(0);
  });

  it("lands on the most recent completed week, ignoring input order", () => {
    expect(defaultSeasonStripIndex([ep(1, "completed"), ep(3, "upcoming"), ep(2, "completed")])).toBe(1);
  });

  it("falls back to the first episode before anything has completed", () => {
    expect(defaultSeasonStripIndex([ep(2, "upcoming"), ep(1, "upcoming")])).toBe(0);
  });

  it("stays on the finale after the season is fully completed", () => {
    expect(defaultSeasonStripIndex([ep(1, "completed"), ep(2, "completed")])).toBe(1);
  });

  it("does not skip forward to a locked or upcoming week when a completed week exists", () => {
    expect(defaultSeasonStripIndex([ep(1, "completed"), ep(2, "locked"), ep(3, "upcoming")])).toBe(0);
  });
});

describe("seasonStripKicker", () => {
  const e01 = ep(1, "completed");
  const e02 = ep(2, "completed");
  const e03 = ep(3, "upcoming");
  const season = [e01, e02, e03];

  it("labels the latest completed week as This past week", () => {
    expect(seasonStripKicker(e02, season)).toBe("This past week");
    expect(seasonStripKicker(e01, season)).toBeNull();
  });

  it("labels the next non-completed week as Up next, including locked", () => {
    expect(seasonStripKicker(e03, season)).toBe("Up next");
    expect(seasonStripKicker(ep(2, "locked"), [e01, ep(2, "locked"), e03])).toBe("Up next");
  });

  it("is Up next on the premiere before anything has completed", () => {
    expect(seasonStripKicker(e01, [ep(1, "upcoming"), ep(2, "upcoming")])).toBe("Up next");
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
