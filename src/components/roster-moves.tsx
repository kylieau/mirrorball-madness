"use client";

import Link from "next/link";
import { CoupleName } from "@/components/couple-name";
import { Button } from "@/components/ui/button";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type LifelineStatus = {
  // The viewer's dead roster spots this week and the Lifeline saved for each.
  spots: { former: CoupleNameParts; pick: CoupleNameParts | null }[];
  lockAt: string | null;
  locked: boolean;
};

export type WaiverStatus = {
  // The viewer's saved list, highest claim first.
  claims: { add: CoupleNameParts; drop: CoupleNameParts | null }[];
  // Open spots the viewer has watched far enough to see.
  openSpotCount: number;
  dueAt: string;
  // The week whose results a run that has come due is still waiting on.
  waitingOnWeek: number | null;
};

// Lifeline, Recast and Trades are separate commissioner switches, so a league
// shows only the ones it has on.
export function RosterMoves({
  leagueId,
  lifelineOn,
  recastOn,
  tradesOn,
  lifeline,
  waivers,
  from,
}: {
  leagueId: string;
  lifelineOn: boolean;
  recastOn: boolean;
  tradesOn: boolean;
  // Null when the viewer has no dead roster spot to confirm a Lifeline for,
  // or when the saved picks couldn't be read.
  lifeline: LifelineStatus | null;
  // Null once no waiver run is left, or when the saved list couldn't be read.
  waivers: WaiverStatus | null;
  from: string;
}) {
  const query = `?from=${encodeURIComponent(from)}`;
  const showLifeline = lifelineOn && lifeline != null;
  const showWaivers = recastOn && waivers != null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {lifelineOn && (
          <Button
            render={<Link href={`/leagues/${leagueId}/lifeline${query}`} />}
            nativeButton={false}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Lifeline
          </Button>
        )}
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
      {(showLifeline || showWaivers) && (
        <div className="flex flex-col gap-3">
          {showLifeline && <LifelineStatusLines {...lifeline} />}
          {showWaivers && <WaiverClaimsStatus {...waivers} />}
        </div>
      )}
    </div>
  );
}

function LifelineStatusLines({ spots, lockAt, locked }: LifelineStatus) {
  const formattedLockAt = useFormattedDeadline(lockAt);
  const saved = spots.filter((spot) => spot.pick).length;
  const lockLine = locked ? "Lifeline is locked for this week." : formattedLockAt ? `Locks ${formattedLockAt}.` : null;

  return (
    <div className="flex flex-col gap-1 px-3.5 text-xs text-muted-foreground">
      {saved > 0 ? (
        <>
          <span className="font-medium text-foreground">
            {saved < spots.length
              ? `${saved} of ${spots.length} Lifelines Saved`
              : saved === 1
                ? "Lifeline Saved"
                : `${saved} Lifelines Saved`}
          </span>
          <ul className="flex flex-col gap-0.5">
            {spots.map((spot, index) => (
              <li key={index}>
                {spot.pick ? (
                  <CoupleName {...spot.pick} />
                ) : (
                  <span className={locked ? undefined : "font-semibold text-accent"}>No pick</span>
                )}
                , in place of <CoupleName {...spot.former} />
              </li>
            ))}
          </ul>
        </>
      ) : locked ? (
        <span>No Lifeline saved.</span>
      ) : (
        <span className="font-semibold text-accent">
          {spots.length === 1 ? "1 empty roster spot" : `${spots.length} empty roster spots`} · No Lifeline saved
        </span>
      )}
      {lockLine && <span>{lockLine}</span>}
    </div>
  );
}

function WaiverClaimsStatus({ claims, openSpotCount, dueAt, waitingOnWeek }: WaiverStatus) {
  const due = useFormattedDeadline(dueAt);
  const runLine =
    waitingOnWeek != null
      ? `The waiver run is waiting on ${formatEpisodeCasual(waitingOnWeek)} results.`
      : due
        ? `Next waiver run: ${due}.`
        : null;

  return (
    <div className="flex flex-col gap-1 px-3.5 text-xs text-muted-foreground">
      {claims.length > 0 ? (
        <>
          <span className="font-medium text-foreground">
            {claims.length === 1 ? "1 Waiver Claim Saved" : `${claims.length} Waiver Claims Saved`}
          </span>
          <ol className="flex flex-col gap-0.5">
            {claims.map((claim, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-3 shrink-0 tabular-nums">{index + 1}</span>
                <span className="min-w-0">
                  Add <CoupleName {...claim.add} />
                  {claim.drop ? (
                    <>
                      , drop <CoupleName {...claim.drop} />
                    </>
                  ) : (
                    ", open spot"
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : openSpotCount > 0 ? (
        <span className="font-semibold text-accent">
          {openSpotCount === 1 ? "1 open spot" : `${openSpotCount} open spots`} · No waiver claim saved
        </span>
      ) : (
        <span>No waiver claims saved.</span>
      )}
      {runLine && <span>{runLine}</span>}
    </div>
  );
}
