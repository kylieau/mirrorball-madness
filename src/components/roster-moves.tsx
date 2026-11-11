import Link from "next/link";
import { Button } from "@/components/ui/button";

// Recast and Trades are separate commissioner switches, so a league shows
// only the ones it has on.
export function RosterMoves({
  leagueId,
  recastOn,
  tradesOn,
  from,
}: {
  leagueId: string;
  recastOn: boolean;
  tradesOn: boolean;
  from: string;
}) {
  const query = `?from=${encodeURIComponent(from)}`;
  return (
    <div className="flex gap-2">
      {recastOn && (
        <Button
          render={<Link href={`/leagues/${leagueId}/waivers${query}`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          Recast
        </Button>
      )}
      {tradesOn && (
        <Button
          render={<Link href={`/leagues/${leagueId}/trades${query}`} />}
          nativeButton={false}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          Trades
        </Button>
      )}
    </div>
  );
}
