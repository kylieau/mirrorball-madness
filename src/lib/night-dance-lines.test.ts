import { describe, expect, it } from "vitest";
import { coupleDanceLines, isTeamDance, teamDanceEpisodeIds, type NightDance } from "./night-dance-lines";

const dance = (style: string, totalScore: number, scaledScore: number, song: string | null = null, episodeId = "ep1"): NightDance => ({
  episodeId,
  coupleId: "amber",
  style,
  song,
  totalScore,
  scaledScore,
});
const teamNight = new Set(["ep1"]);

describe("coupleDanceLines", () => {
  it("shows each dance with its score and the night total over the max on a multi-dance night", () => {
    const lines = coupleDanceLines([dance("Quickstep", 28, 21), dance("Freestyle", 36, 27)], teamNight);
    expect(lines.join(" · ")).toBe("Quickstep 28 · Freestyle (Team) 36 · Night 64/80");
  });

  it("keeps songs on the dance's own line", () => {
    expect(coupleDanceLines([dance("Quickstep", 28, 21, "Let It Go"), dance("Freestyle", 36, 27, "Slaytopia")], teamNight)).toEqual([
      "Quickstep 28 · Let It Go",
      "Freestyle (Team) 36 · Slaytopia",
      "Night 64/80",
    ]);
  });

  it("leaves a one-dance night as the plain style and song line, since the card total is its score", () => {
    expect(coupleDanceLines([dance("Quickstep", 28, 21, "Let It Go")], teamNight)).toEqual(["Quickstep · Let It Go"]);
    expect(coupleDanceLines([dance("Quickstep", 28, 21)], new Set())).toEqual(["Quickstep"]);
  });

  it("labels a Freestyle as Team only on a Team Dance episode", () => {
    expect(coupleDanceLines([dance("Quickstep", 28, 21), dance("Freestyle", 36, 27)], new Set()).join(" · ")).toBe(
      "Quickstep 28 · Freestyle 36 · Night 64/80"
    );
    expect(isTeamDance("Team Freestyle", true)).toBe(true);
    expect(isTeamDance("Jive", true)).toBe(false);
    expect(isTeamDance("Freestyle", false)).toBe(false);
  });

  it("uses each dance's own max on a mixed-panel night and keeps half points", () => {
    expect(coupleDanceLines([dance("Tango", 24, 24), dance("Freestyle", 38.5, 28.875)], teamNight)).toEqual([
      "Tango 24",
      "Freestyle (Team) 38.5",
      "Night 62.5/70",
    ]);
  });

  it("shows totals only when a dance's panel cannot be recovered", () => {
    expect(coupleDanceLines([dance("Tango", 0, 0), dance("Freestyle", 36, 27)], teamNight)).toEqual([
      "Tango 0",
      "Freestyle (Team) 36",
      "Night 36",
    ]);
  });

  it("keeps two one-dance nights of the same week as plain lines", () => {
    expect(coupleDanceLines([dance("Tango", 24, 24, null, "night-1"), dance("Jive", 27, 27, null, "night-2")], new Set())).toEqual([
      "Tango",
      "Jive",
    ]);
  });
});

describe("teamDanceEpisodeIds", () => {
  it("reads both join shapes and ignores other round types", () => {
    expect(
      teamDanceEpisodeIds([
        { episode_id: "a", round_types: { name: "Team Dance" } },
        { episode_id: "b", round_types: [{ name: "Trio Dance" }, { name: "Team Dance" }] },
        { episode_id: "c", round_types: { name: "Instant Dance" } },
        { episode_id: "d", round_types: null },
      ])
    ).toEqual(new Set(["a", "b"]));
  });
});
