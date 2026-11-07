import { coupleLeagueNotes } from "./couple-league-notes";
import { buildCouplesLeaderboard } from "./couples-leaderboard";
import { nextPredictedElimination, type PinnableCouple } from "./grand-finale-pins";
import type { RosterSlotPeriod } from "./roster-couple-points";
import type { HistoryWeekData } from "./score-history";
import type { ScoringSettings } from "./scoring";
import type { DanceCardRule } from "./dance-card-v2";
import { spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";

export type CoupleLeagueInput = {
  id: string;
  name: string;
  // The viewer's team id (the primary's user id, also for a co-manager).
  myTeamId: string;
  managerNames: ReadonlyMap<string, string>;
  scoring: ScoringSettings;
  rule?: DanceCardRule;
  // v2 only: the shown weeks with a posting week's published sibling nights.
  danceCardWeeks?: Pick<HistoryWeekData, "weekNumber" | "danceScores" | "outcomes">[];
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
      rule: league.rule,
      scoring: league.scoring,
      anchorWeek: league.anchorWeek,
      categoryWeight: league.categoryWeight,
      weeks: league.danceCardWeeks ?? weeks,
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

export type WeekPick = { leagueId: string; weekNumber: number; eliminatedIds: string[]; topScorerId: string | null };

// Results' gold pick lines for one couple in one shown week, across the
// viewer's leagues: Curtain Call picks for that week, the Grand Finale
// bracket's next elimination with statuses clamped to that week, and the
// predicted winner from the semi-final on. No roster line: the week cards
// stack on one page, and In Your Leagues already names the holder.
export function coupleWeekPickNotes({
  coupleId,
  weekNumber,
  finaleWeekNumber,
  leagueNames,
  picks,
  grandFinaleOrders,
  couples,
}: {
  coupleId: string;
  weekNumber: number;
  finaleWeekNumber: number | null;
  // Every one of the viewer's leagues, so the phrasing can say "all-leagues".
  leagueNames: ReadonlyMap<string, string>;
  picks: WeekPick[];
  // Elimination-ascending order per league.
  grandFinaleOrders: ReadonlyMap<string, string[]>;
  couples: PinnableCouple[];
}): string[] {
  const names = (leagueIds: string[]) => leagueIds.flatMap((id) => leagueNames.get(id) ?? []);
  const weekPicks = picks.filter((pick) => pick.weekNumber === weekNumber);
  const clamped = couples.map((c) => ({
    ...c,
    status: spoilerSafeCoupleStatus({ status: c.status, eliminationWeek: c.elimination_week }, weekNumber, finaleWeekNumber),
  }));
  const semiFinalOn = finaleWeekNumber !== null && weekNumber >= finaleWeekNumber - 1;
  const orders = [...grandFinaleOrders].filter(([, order]) => order.length > 0);
  return coupleLeagueNotes({
    totalLeagueCount: leagueNames.size,
    eliminationPickLeagues: names(weekPicks.filter((pick) => pick.eliminatedIds.includes(coupleId)).map((pick) => pick.leagueId)),
    topScorerPickLeagues: names(weekPicks.filter((pick) => pick.topScorerId === coupleId).map((pick) => pick.leagueId)),
    grandFinaleNextElimLeagues: names(orders.filter(([, order]) => nextPredictedElimination(order, clamped) === coupleId).map(([id]) => id)),
    grandFinaleWinnerLeagues: semiFinalOn ? names(orders.filter(([, order]) => order[order.length - 1] === coupleId).map(([id]) => id)) : [],
  });
}
