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

// Each league's roster moves for Home's Recent Activity, by the week whose
// waiver run made them: trades first, as the run settles them, then claims by
// manager. The viewer's own team reads as "You" where it opens the line and
// "you" after.
export function homeTransactions({
  leagues,
  claims,
  trades,
  coupleOf,
}: {
  leagues: TransactionLeague[];
  claims: AwardedClaim[];
  trades: ExecutedTrade[];
  coupleOf: (coupleId: string) => ActivityCouple | null;
}): { weekNumber: number; transaction: ActivityTransaction }[] {
  return leagues.flatMap((league) => {
    const nameOf = (managerId: string, you: string) =>
      managerId === league.myTeamId ? you : (league.managerNames[managerId] ?? "Someone");

    const named = (coupleIds: string[]) => coupleIds.flatMap((coupleId) => coupleOf(coupleId) ?? []);

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

    return [...tradeLines, ...claimLines];
  });
}
