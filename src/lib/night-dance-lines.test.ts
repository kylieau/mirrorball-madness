import { describe, expect, it } from "vitest";
import { coupleDanceLines, isTeamDance, teamDanceEpisodeIds, type NightDance, type SpecialDanceLabelInput } from "./night-dance-lines";

const dance = (style: string, totalScore: number, scaledScore: number, song: string | null = null, episodeId = "ep1"): NightDance => ({
  episodeId,
  coupleId: "amber",
  style,
  song,
  totalScore,
  scaledScore,
  maxScore: null,
});
const teamNight = new Set(["ep1"]);
const labels = (entries: Record<string, SpecialDanceLabelInput>) => new Map(Object.entries(entries));
const slaytopia = labels({ t1: { name: "Slaytopia", danceType: "Team Dance", scoringMode: "marks" } });

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

  it("labels a team-tagged row by its type and name, or Team Dance when the name is not readable", () => {
    const team = { ...dance("Freestyle", 36, 27, "Zoo"), teamId: "t1" };
    expect(coupleDanceLines([dance("Quickstep", 28, 21), team], new Set(), slaytopia).join(" · ")).toBe(
      "Quickstep 28 · Team Dance · Slaytopia 36 · Zoo · Night 64/80"
    );
    expect(coupleDanceLines([dance("Quickstep", 28, 21), team], new Set()).join(" · ")).toBe("Quickstep 28 · Team Dance 36 · Zoo · Night 64/80");
    expect(coupleDanceLines([team], new Set(), slaytopia)).toEqual(["Team Dance · Slaytopia · Zoo"]);
  });

  it("does not repeat the type before an automatic name", () => {
    const relay = { ...dance("Freestyle", 27, 27, null), teamId: "t2", maxScore: 30 };
    const named = labels({ t2: { name: "Relay 2", danceType: "Relay", scoringMode: "marks" } });
    expect(coupleDanceLines([dance("Tango", 24, 24), relay], new Set(), named)).toEqual(["Tango 24", "Relay 2 27", "Night 51/60"]);
  });

  it("reads a bonus round in points as a signed line and keeps the marks out of the max", () => {
    const danceOff = { ...dance("Freestyle", 3, 0), teamId: "d1", maxScore: 0 };
    const named = labels({ d1: { name: "Dance-Off 1", danceType: "Dance-Off", scoringMode: "points" } });
    expect(coupleDanceLines([dance("Quickstep", 28, 28), dance("Freestyle", 36, 27, "Zoo"), danceOff], teamNight, named)).toEqual([
      "Quickstep 28",
      "Freestyle (Team) 36 · Zoo",
      "Dance-Off · +3",
      "Night 67 · 64/70",
    ]);
    expect(coupleDanceLines([{ ...danceOff, totalScore: -1.5 }], new Set(), named)).toEqual(["Dance-Off · −1.5"]);
    expect(coupleDanceLines([danceOff], new Set())).toEqual(["Bonus · +3"]);
  });

  it("takes a special dance's own max when its row carries one", () => {
    const outOfEight = { ...dance("Freestyle", 30, 28.125), teamId: "t3", maxScore: 32 };
    const named = labels({ t3: { name: "Wildcats", danceType: "Team Dance", scoringMode: "marks" } });
    expect(coupleDanceLines([dance("Tango", 24, 24), outOfEight], new Set(), named)).toEqual([
      "Tango 24",
      "Team Dance · Wildcats 30",
      "Night 54/62",
    ]);
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
