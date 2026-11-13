import type { ActivityCouple, ActivityTransaction } from "./home-activity";
import { tradeSides, type TradeLeg } from "./trades";

export type TransactionLeague = { id: string; name: string; myTeamId: string; managerNames: Record<string, string> };
export type AwardedClaim = {
  leagueId: string;
  managerId: string;
  coupleId: string;
  dropCoupleId: string | null;
  weekNumber: number;
};
export type ExecutedTrade = { leagueId: string; weekNumber: number; legs: TradeLeg[] };
// One row per couple a departed manager held; the name is as stored at
// release time, since the league no longer knows them.
export type ReleasedCouple = { leagueId: string; managerId: string; managerName: string; coupleId: string; weekNumber: number };

// Each league's roster moves for Home's Recent Activity, by the week whose
// waiver run made them: trades first, as the run settles them, then claims by
// manager. The viewer's own team reads as "You" where it opens the line and
// "you" after.
export function homeTransactions({
  leagues,
  claims,
  trades,
  releases = [],
  coupleOf,
}: {
  leagues: TransactionLeague[];
  claims: AwardedClaim[];
  trades: ExecutedTrade[];
  releases?: ReleasedCouple[];
  coupleOf: (coupleId: string) => ActivityCouple | null;
}): { weekNumber: number; transaction: ActivityTransaction }[] {
  return leagues.flatMap((league) => {
    const nameOf = (managerId: string, you: string) =>
      managerId === league.myTeamId ? you : (league.managerNames[managerId] ?? "Someone");

    const named = (coupleIds: string[]) => coupleIds.flatMap((coupleId) => coupleOf(coupleId) ?? []);

    // One line per departed manager, their couples together, A–Z by name.
    const releaseLines = [...new Map(
      releases
        .filter((release) => release.leagueId === league.id)
        .map((release) => [`${release.managerId}:${release.weekNumber}`, release] as const)
    ).values()]
      .map((release) => ({
        weekNumber: release.weekNumber,
        manager: release.managerId === league.myTeamId ? "You" : release.managerName,
        couples: named(
          releases
            .filter((row) => row.leagueId === league.id && row.managerId === release.managerId && row.weekNumber === release.weekNumber)
            .map((row) => row.coupleId)
        ),
      }))
      .filter((line) => line.couples.length > 0)
      .sort((x, y) => x.manager.localeCompare(y.manager))
      // Under the last week they held the roster, the one with results.
      .map((line) => ({
        weekNumber: line.weekNumber - 1,
        transaction: { kind: "release" as const, league: league.name, manager: line.manager, couples: line.couples },
      }));

    const tradeLines = trades
      .filter((trade) => trade.leagueId === league.id)
      .flatMap((trade) => {
        const sides = tradeSides(trade.legs);
        return sides.some((side) => named(side.coupleIds).length < side.coupleIds.length)
          ? []
          : [
              {
                weekNumber: trade.weekNumber,
                transaction: {
                  kind: "trade" as const,
                  league: league.name,
                  sides: sides.map((side, i) => ({
                    manager: nameOf(side.managerId, i === 0 ? "You" : "you"),
                    couples: named(side.coupleIds),
                    points: side.points,
                  })),
                },
              },
            ];
      });

    const claimLines = claims
      .filter((claim) => claim.leagueId === league.id)
      .map((claim) => ({ claim, manager: nameOf(claim.managerId, "You") }))
      .sort((a, b) => a.manager.localeCompare(b.manager))
      .flatMap(({ claim, manager }) => {
        const added = coupleOf(claim.coupleId);
        const dropped = claim.dropCoupleId ? coupleOf(claim.dropCoupleId) : null;
        return added && (dropped || !claim.dropCoupleId)
          ? [
              {
                weekNumber: claim.weekNumber,
                transaction: { kind: "waiver" as const, league: league.name, manager, added, dropped },
              },
            ]
          : [];
      });

    return [...tradeLines, ...claimLines, ...releaseLines];
  });
}
