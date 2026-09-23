import { describe, expect, it } from "vitest";
import {
  formatEpisodeCasual,
  formatEpisodeCasualAbbreviated,
  formatEpisodeCasualShort,
  formatEpisodeCasualWithTheme,
  formatEpisodeLabel,
  formatEnterResultsOption,
  formatNightsLabel,
} from "./format-week";

describe("formatEpisodeLabel", () => {
  it("zero-pads the episode and prefixes the season with a space", () => {
    expect(formatEpisodeLabel(2, 35)).toBe("S35 E02");
  });

  it("omits the season prefix when seasonNumber is null or undefined", () => {
    expect(formatEpisodeLabel(2)).toBe("E02");
    expect(formatEpisodeLabel(2, null)).toBe("E02");
  });

  it("does not pad the season number", () => {
    expect(formatEpisodeLabel(12, 7)).toBe("S7 E12");
  });
});

describe("formatEpisodeCasual", () => {
  it("uses Week N for roomy fan copy", () => {
    expect(formatEpisodeCasual(2)).toBe("Week 2");
    expect(formatEpisodeCasual(12)).toBe("Week 12");
  });
});

describe("formatEpisodeCasualShort", () => {
  it("uses Week N for tight fan UI (same phrase as the roomy form)", () => {
    expect(formatEpisodeCasualShort(2)).toBe("Week 2");
  });
});

describe("formatEpisodeCasualAbbreviated", () => {
  it("uses Wk N for tight inline spots, no em dash", () => {
    expect(formatEpisodeCasualAbbreviated(2)).toBe("Wk 2");
  });
});

describe("formatEpisodeCasualWithTheme", () => {
  it("appends a theme with an em dash when one is present", () => {
    expect(formatEpisodeCasualWithTheme(2, "Latin Night")).toBe("Week 2 — Latin Night");
  });

  it("falls back to the week label when theme is missing or blank", () => {
    expect(formatEpisodeCasualWithTheme(2)).toBe("Week 2");
    expect(formatEpisodeCasualWithTheme(2, null)).toBe("Week 2");
    expect(formatEpisodeCasualWithTheme(2, "  ")).toBe("Week 2");
  });
});

describe("formatNightsLabel", () => {
  it("is null for a single-episode week", () => {
    expect(formatNightsLabel(["Latin Night"])).toBeNull();
    expect(formatNightsLabel([])).toBeNull();
  });

  it("joins night themes when a week groups multiple airings", () => {
    expect(formatNightsLabel(["Night One", "Night Two"])).toBe("Night One + Night Two");
  });

  it("falls back to an N nights count when themes are missing", () => {
    expect(formatNightsLabel([null, "Night Two"])).toBe("2 nights");
    expect(formatNightsLabel([null, null])).toBe("2 nights");
  });
});

describe("formatEnterResultsOption", () => {
  const airsAt = "2026-09-16T00:00:00Z";

  it("labels a single-episode week as Week N — theme", () => {
    expect(formatEnterResultsOption({ weekNumber: 2, nightsCount: 1, episodeTheme: "Latin Night", airsAt })).toContain(
      "Week 2 — Latin Night"
    );
  });

  it("uses a night name, not S35 E0x, on a multi-episode week", () => {
    const label = formatEnterResultsOption({
      weekNumber: 1,
      nightsCount: 2,
      episodeTheme: "Night One",
      airsAt,
    });
    expect(label).toContain("Week 1 · Night One");
    expect(label).not.toContain("E01");
    expect(label).not.toContain("S35");
  });

  it("marks unassigned airings as exhibition", () => {
    expect(
      formatEnterResultsOption({ weekNumber: null, nightsCount: 0, episodeTheme: "Interview", airsAt })
    ).toContain("Interview (exhibition)");
  });
});
