import { buildCouplesLeaderboard } from "./couples-leaderboard";
import type { RosterSlotPeriod } from "./roster-couple-points";
import type { HistoryWeekData } from "./score-history";
import type { ScoringSettings } from "./scoring";

export type CoupleLeagueInput = {
  id: string;
  name: string;
  // The viewer's team id (the primary's user id, also for a co-manager).
  myTeamId: string;
  managerNames: ReadonlyMap<string, string>;
  scoring: ScoringSettings;
  anchorWeek: number;
  categoryWeight: number;
  slots: RosterSlotPeriod[];
};

export type CoupleLeagueRow = {
  leagueId: string;
  leagueName: string;
  owner: { kind: "you" } | { kind: "manager"; name: string } | { kind: "undrafted" };
  judgesPoints: number;
};

// One row per league for the couple page's In Your Leagues card: who holds
// the couple and its judges' points there, read off the same Couples
// Leaderboard row Standings shows (an undrafted couple's points are its
// what-if from the Anchor Week).
export function buildCoupleLeagueRows({
  coupleId,
  weeks,
  couples,
  leagues,
}: {
  coupleId: string;
  weeks: Pick<HistoryWeekData, "weekNumber" | "danceScores" | "outcomes">[];
  couples: { id: string; status: string; elimination_week: number | null }[];
  leagues: CoupleLeagueInput[];
}): CoupleLeagueRow[] {
  return leagues.flatMap((league) => {
    const standing = buildCouplesLeaderboard({
      scoring: league.scoring,
      anchorWeek: league.anchorWeek,
      categoryWeight: league.categoryWeight,
      weeks,
      couples,
      slots: league.slots,
    }).find((row) => row.coupleId === coupleId);
    if (!standing) return [];
    const owner: CoupleLeagueRow["owner"] =
      standing.ownerId === null
        ? { kind: "undrafted" }
        : standing.ownerId === league.myTeamId
          ? { kind: "you" }
          : { kind: "manager", name: league.managerNames.get(standing.ownerId) ?? "Unknown" };
    return [{ leagueId: league.id, leagueName: league.name, owner, judgesPoints: standing.judgesPoints }];
  });
}
