import { describe, expect, it } from "vitest";
import {
  formatEpisodeCasual,
  formatEpisodeCasualShort,
  formatEpisodeCasualWithTheme,
  formatEpisodeLabel,
  isScoringWeek,
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
  it("uses the unpadded Week N phrase for roomy fan copy", () => {
    expect(formatEpisodeCasual(2)).toBe("Week 2");
    expect(formatEpisodeCasual(12)).toBe("Week 12");
  });
});

describe("formatEpisodeCasualShort", () => {
  it("uses Week N for tight fan UI", () => {
    expect(formatEpisodeCasualShort(2)).toBe("Week 2");
  });
});

describe("formatEpisodeCasualWithTheme", () => {
  it("appends a theme with an em dash when one is present", () => {
    expect(formatEpisodeCasualWithTheme(2, "Latin Night")).toBe("Week 2 — Latin Night");
  });

  it("falls back to the short label when theme is missing or blank", () => {
    expect(formatEpisodeCasualWithTheme(2)).toBe("Week 2");
    expect(formatEpisodeCasualWithTheme(2, null)).toBe("Week 2");
    expect(formatEpisodeCasualWithTheme(2, "  ")).toBe("Week 2");
  });
});

describe("isScoringWeek", () => {
  it("treats missing or true as a competition week", () => {
    expect(isScoringWeek({})).toBe(true);
    expect(isScoringWeek({ is_scoring: true })).toBe(true);
    expect(isScoringWeek({ is_scoring: null })).toBe(true);
  });

  it("drops exhibition / interview nights", () => {
    expect(isScoringWeek({ is_scoring: false })).toBe(false);
  });
});
