import { describe, expect, it } from "vitest";
import { coupleLeagueNotes } from "./couple-league-notes";

describe("coupleLeagueNotes", () => {
  it("puts the league name before the noun", () => {
    expect(
      coupleLeagueNotes({
        rosterLeagues: ["Alpha"],
        eliminationPickLeagues: ["Alpha"],
        topScorerPickLeagues: ["Alpha"],
        totalLeagueCount: 3,
      })
    ).toEqual(["On your Alpha roster", "Your Alpha elim pick", "Your Alpha top-scorer pick"]);
  });

  it("joins two leagues and pluralizes the noun", () => {
    expect(coupleLeagueNotes({ rosterLeagues: ["Alpha", "Beta"], totalLeagueCount: 3 })).toEqual([
      "On your Alpha and Beta rosters",
    ]);
  });

  it("omits notes with no leagues", () => {
    expect(coupleLeagueNotes({ totalLeagueCount: 1 })).toEqual([]);
  });

  it("collapses to all-leagues when the stake spans every league the viewer is in", () => {
    expect(coupleLeagueNotes({ rosterLeagues: ["Alpha", "Beta", "Gamma"], totalLeagueCount: 3 })).toEqual([
      "On your all-leagues rosters",
    ]);
  });

  it("does not collapse to all-leagues with only one league total", () => {
    expect(coupleLeagueNotes({ rosterLeagues: ["Alpha"], totalLeagueCount: 1 })).toEqual(["On your Alpha roster"]);
  });

  it("shortens 3+ leagues that aren't all of them to a count instead of a name dump", () => {
    expect(
      coupleLeagueNotes({ eliminationPickLeagues: ["A", "B", "C"], totalLeagueCount: 5 })
    ).toEqual(["Your 3 leagues' elim picks"]);
  });

  it("adds a Grand Finale next-elim note as a bracket next-elim pick, distinct from Curtain Call's elim pick", () => {
    expect(coupleLeagueNotes({ grandFinaleNextElimLeagues: ["Alpha"], totalLeagueCount: 2 })).toEqual([
      "Your Alpha bracket next-elim pick",
    ]);
  });

  it("adds a Grand Finale winner note, collapsible like any other stake", () => {
    expect(
      coupleLeagueNotes({ grandFinaleWinnerLeagues: ["Alpha", "Beta"], totalLeagueCount: 2 })
    ).toEqual(["Your all-leagues winner picks"]);
  });

  it("returns one line per stake type, in order, when several apply at once", () => {
    expect(
      coupleLeagueNotes({
        rosterLeagues: ["Alpha"],
        grandFinaleNextElimLeagues: ["Alpha"],
        totalLeagueCount: 1,
      })
    ).toEqual(["On your Alpha roster", "Your Alpha bracket next-elim pick"]);
  });
});
