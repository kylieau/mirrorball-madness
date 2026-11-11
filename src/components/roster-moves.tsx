"use client";

import Link from "next/link";
import { CoupleName } from "@/components/couple-name";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type LifelineStatus = {
  // The viewer's dead roster spots this week and the Lifeline saved for each.
  spots: { former: CoupleNameParts; pick: CoupleNameParts | null }[];
  weekNumber: number;
  lockAt: string | null;
  locked: boolean;
};

export type WaiverStatus = {
  // The viewer's saved list, highest claim first.
  claims: { add: CoupleNameParts; drop: CoupleNameParts | null }[];
  // Open spots the viewer has watched far enough to see.
  openSpotCount: number;
  dueAt: string;
  // The week a winning claim starts scoring.
  startWeek: number;
  // The week whose results a run that has come due is still waiting on.
  waitingOnWeek: number | null;
};

// Lifeline, Recast and Trades are separate commissioner switches, so a league
// shows only the ones it has on. The card sits outside Your Fantasy Roster
// because its lines are about the weeks still to come, not the roster's paged
// week, so each line names its own week.
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
    <Card>
      <CardHeader>
        <CardTitle>Roster Moves</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          {lifelineOn && (
            <Button
              render={<Link href={`/leagues/${leagueId}/lifeline${query}`} />}
              nativeButton={false}
              variant="outline"
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
              className="flex-1"
            >
              Trades
            </Button>
          )}
        </div>
        {showLifeline && <LifelineStatusLines {...lifeline} />}
        {showWaivers && <WaiverClaimsStatus {...waivers} />}
      </CardContent>
    </Card>
  );
}

// The card's lines are sentences, so a relative day reads in lower case there
// ("locks today 8 PM PT") while it stays a label elsewhere.
function inSentence(formatted: string): string {
  return formatted.replace(/^(Today|Tomorrow) /, (day) => day.toLowerCase());
}

function LifelineStatusLines({ spots, weekNumber, lockAt, locked }: LifelineStatus) {
  const formattedLockAt = useFormattedDeadline(lockAt);
  const saved = spots.filter((spot) => spot.pick).length;
  const savedPart =
    saved === 0 ? (locked ? "None saved" : null) : saved < spots.length ? `${saved} of ${spots.length} saved` : "Saved";
  const lockPart = locked ? "Locked" : formattedLockAt ? `Locks ${inSentence(formattedLockAt)}` : null;
  const statusLine = [savedPart, lockPart].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-sm font-medium text-foreground">
        {formatEpisodeCasual(weekNumber)} {spots.length === 1 ? "Lifeline" : "Lifelines"}
      </span>
      {saved > 0 ? (
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
      ) : (
        !locked && (
          <span className="font-semibold text-accent">
            {spots.length === 1 ? "1 empty roster spot" : `${spots.length} empty roster spots`} · No Lifeline saved
          </span>
        )
      )}
      {statusLine && <span>{statusLine}.</span>}
    </div>
  );
}

function WaiverClaimsStatus({ claims, openSpotCount, dueAt, startWeek, waitingOnWeek }: WaiverStatus) {
  const due = useFormattedDeadline(dueAt);
  const runPart =
    waitingOnWeek != null
      ? `The run is waiting on ${formatEpisodeCasual(waitingOnWeek)} results`
      : due
        ? `Next run ${inSentence(due)}`
        : null;
  const savedPart = claims.length > 0 ? `${claims.length} saved` : openSpotCount > 0 ? null : "None saved";
  const statusLine = [savedPart, runPart].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-sm font-medium text-foreground">Waiver Claims</span>
      {claims.length > 0 ? (
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
      ) : (
        openSpotCount > 0 && (
          <span className="font-semibold text-accent">
            {openSpotCount === 1 ? "1 open spot" : `${openSpotCount} open spots`} · No waiver claim saved
          </span>
        )
      )}
      {statusLine && (
        <span>
          {statusLine}.
          {(claims.length > 0 || openSpotCount > 0) && (
            <>
              {" "}
              <span className="whitespace-nowrap">Winning claims start scoring in {formatEpisodeCasual(startWeek)}.</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
