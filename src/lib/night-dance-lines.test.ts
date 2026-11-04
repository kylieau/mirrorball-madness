import { describe, expect, it } from "vitest";
import { coupleDanceLines, isTeamDance, teamDanceEpisodeIds, type NightDance, type SpecialDanceLabelInput } from "./night-dance-lines";

const dance = (style: string, totalScore: number, song: string | null = null, episodeId = "ep1"): NightDance => ({
  episodeId,
  coupleId: "amber",
  style,
  song,
  totalScore,
  maxScore: null,
});
const teamNight = new Set(["ep1"]);
const labels = (entries: Record<string, SpecialDanceLabelInput>) => new Map(Object.entries(entries));
const slaytopia = labels({ t1: { name: "Slaytopia", danceType: "Team Dance", scoringMode: "marks" } });

describe("coupleDanceLines", () => {
  it("keeps scores off the lines and lists each dance's score as a part on a multi-dance night", () => {
    expect(coupleDanceLines([dance("Quickstep", 28, "Let It Go"), dance("Freestyle", 36, "Slaytopia")], teamNight)).toEqual({
      lines: ["Quickstep · Let It Go", "Freestyle (Team) · Slaytopia"],
      parts: { marks: ["28", "36"], bonus: [] },
    });
  });

  it("leaves a one-dance card with no parts, since the card total is its score", () => {
    expect(coupleDanceLines([dance("Quickstep", 28, "Let It Go")], teamNight)).toEqual({ lines: ["Quickstep · Let It Go"], parts: null });
    expect(coupleDanceLines([dance("Quickstep", 28)], new Set())).toEqual({ lines: ["Quickstep"], parts: null });
  });

  it("labels a Freestyle as Team only on a Team Dance episode", () => {
    expect(coupleDanceLines([dance("Quickstep", 28), dance("Freestyle", 36)], new Set()).lines).toEqual(["Quickstep", "Freestyle"]);
    expect(isTeamDance("Team Freestyle", true)).toBe(true);
    expect(isTeamDance("Jive", true)).toBe(false);
    expect(isTeamDance("Freestyle", false)).toBe(false);
  });

  it("labels a team-tagged row by its type and name, or Team Dance when the name is not readable", () => {
    const team = { ...dance("Freestyle", 36, "Zoo"), teamId: "t1" };
    expect(coupleDanceLines([dance("Quickstep", 28), team], new Set(), slaytopia).lines).toEqual(["Quickstep", "Team Dance · Slaytopia · Zoo"]);
    expect(coupleDanceLines([dance("Quickstep", 28), team], new Set()).lines).toEqual(["Quickstep", "Team Dance · Zoo"]);
    expect(coupleDanceLines([team], new Set(), slaytopia).lines).toEqual(["Team Dance · Slaytopia · Zoo"]);
  });

  it("does not repeat the type before an automatic name", () => {
    const relay = { ...dance("Freestyle", 27), teamId: "t2", maxScore: 30 };
    const named = labels({ t2: { name: "Relay 2", danceType: "Relay", scoringMode: "marks" } });
    expect(coupleDanceLines([dance("Tango", 24), relay], new Set(), named).lines).toEqual(["Tango", "Relay 2"]);
  });

  it("lists a bonus round's points apart from the marks, and keeps them in its line only when it is the card's one row", () => {
    const danceOff = { ...dance("Freestyle", 3), teamId: "d1", maxScore: 0 };
    const named = labels({ d1: { name: "Dance-Off 1", danceType: "Dance-Off", scoringMode: "points" } });
    expect(coupleDanceLines([dance("Quickstep", 28), dance("Freestyle", 36, "Zoo"), danceOff], teamNight, named)).toEqual({
      lines: ["Quickstep", "Freestyle (Team) · Zoo", "Dance-Off"],
      parts: { marks: ["28", "36"], bonus: ["+3"] },
    });
    expect(coupleDanceLines([{ ...danceOff, totalScore: -1.5 }], new Set(), named)).toEqual({ lines: ["Dance-Off · −1.5"], parts: null });
    expect(coupleDanceLines([danceOff], new Set()).lines).toEqual(["Bonus · +3"]);
  });

  it("leaves out a dance-off loser's 0, and lists nothing when only the couple's own dance is left", () => {
    const lost = { ...dance("Cha-Cha", 0), teamId: "d1", maxScore: 0 };
    const named = labels({ d1: { name: "Dance-Off", danceType: "Dance-Off", scoringMode: "points" } });
    expect(coupleDanceLines([dance("Tango", 27), lost], new Set(), named)).toEqual({ lines: ["Tango", "Dance-Off"], parts: null });
    const immune = { ...dance("Freestyle", 3), teamId: "i1", maxScore: 0 };
    const immunity = labels({ i1: { name: "Immunity", danceType: "Immunity", scoringMode: "points" } });
    expect(coupleDanceLines([dance("Tango", 27), immune], new Set(), immunity)).toEqual({
      lines: ["Tango", "Immunity"],
      parts: { marks: ["27"], bonus: ["+3"] },
    });
  });

  it("keeps half points in a part", () => {
    expect(coupleDanceLines([dance("Tango", 24), dance("Freestyle", 38.5)], teamNight).parts).toEqual({ marks: ["24", "38.5"], bonus: [] });
  });

  it("lists both nights of a two-night week a night at a time", () => {
    expect(
      coupleDanceLines([dance("Tango", 24, null, "night-1"), dance("Jive", 27, null, "night-2"), dance("Salsa", 26, null, "night-1")], new Set())
    ).toEqual({ lines: ["Tango", "Salsa", "Jive"], parts: { marks: ["24", "26", "27"], bonus: [] } });
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
