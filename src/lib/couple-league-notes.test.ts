import { describe, expect, it } from "vitest";
import { coupleLeagueNotes } from "./couple-league-notes";

describe("coupleLeagueNotes", () => {
  it("puts the league name before the noun", () => {
    expect(
      coupleLeagueNotes({
        rosterLeagues: ["Alpha"],
        eliminationPickLeagues: ["Alpha"],
        topScorerPickLeagues: ["Alpha"],
      })
    ).toEqual(["On your Alpha roster", "Your Alpha elimination pick", "Your Alpha top-scorer pick"]);
  });

  it("joins several leagues and pluralizes the noun", () => {
    expect(coupleLeagueNotes({ rosterLeagues: ["Alpha", "Beta"] })).toEqual(["On your Alpha and Beta rosters"]);
    expect(coupleLeagueNotes({ eliminationPickLeagues: ["A", "B", "C"] })).toEqual([
      "Your A, B, and C elimination picks",
    ]);
  });

  it("omits notes with no leagues", () => {
    expect(coupleLeagueNotes({})).toEqual([]);
  });
});
