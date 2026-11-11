"use client";

import Link from "next/link";
import { cn } from "cn";
import { CircleCheckIcon, CircleDashedIcon, HourglassIcon } from "lucide-react";
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
  // Null until the run's week has its results posted; the run is 48 hours after.
  dueAt: string | null;
  // The week the run is for.
  weekNumber: number;
  // The week a winning claim starts scoring.
  startWeek: number;
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

const ICON = "mt-px size-3.5 shrink-0";

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
        <ul className="flex flex-col gap-1">
          {spots.map((spot, index) => (
            <li key={index} className="flex gap-1.5">
              {spot.pick ? (
                <CircleCheckIcon aria-hidden className={cn(ICON, "text-emerald-text")} />
              ) : (
                <CircleDashedIcon aria-hidden className={cn(ICON, !locked && "text-accent")} />
              )}
              <span className="min-w-0">
                {spot.pick ? (
                  <span className="text-foreground">
                    <CoupleName {...spot.pick} />
                  </span>
                ) : (
                  <span className={locked ? undefined : "font-semibold text-accent"}>No pick</span>
                )}
                , in place of <CoupleName {...spot.former} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        !locked && (
          <span className="flex gap-1.5 font-semibold text-accent">
            <CircleDashedIcon aria-hidden className={ICON} />
            <span className="min-w-0">
              {spots.length === 1 ? "1 empty roster spot" : `${spots.length} empty roster spots`} · No Lifeline saved
            </span>
          </span>
        )
      )}
      {statusLine && (
        <span className="flex gap-1.5">
          {saved === 0 && locked && <CircleDashedIcon aria-hidden className={ICON} />}
          <span className="min-w-0">{statusLine}.</span>
        </span>
      )}
    </div>
  );
}

function WaiverClaimsStatus({ claims, openSpotCount, dueAt, weekNumber, startWeek }: WaiverStatus) {
  const due = useFormattedDeadline(dueAt);
  const when =
    dueAt == null ? `48 hours after ${formatEpisodeCasual(weekNumber)} results are posted` : due ? inSentence(due) : null;
  // A Lifeline is settled once saved; a claim still waits on the run.
  const statusLine =
    claims.length > 0
      ? when
        ? `${claims.length} saved, waiting on the run · ${when}`
        : `${claims.length} saved`
      : [openSpotCount > 0 ? null : "None saved", when ? `Next run ${when}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-sm font-medium text-foreground">Waiver Claims</span>
      {claims.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {claims.map((claim, index) => (
            <li key={index} className="flex gap-1.5">
              <HourglassIcon aria-hidden className={cn(ICON, "text-accent")} />
              <span className="min-w-0">
                {index + 1} · Add{" "}
                <span className="text-foreground">
                  <CoupleName {...claim.add} />
                </span>
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
          <span className="flex gap-1.5 font-semibold text-accent">
            <CircleDashedIcon aria-hidden className={ICON} />
            <span className="min-w-0">
              {openSpotCount === 1 ? "1 open spot" : `${openSpotCount} open spots`} · No waiver claim saved
            </span>
          </span>
        )
      )}
      {statusLine && (
        <span className="flex gap-1.5">
          {claims.length === 0 && openSpotCount > 0 && <HourglassIcon aria-hidden className={ICON} />}
          <span className="min-w-0">
            {statusLine}.
            {(claims.length > 0 || openSpotCount > 0) && (
              <>
                {" "}
                <span className="whitespace-nowrap">Winning claims start scoring in {formatEpisodeCasual(startWeek)}.</span>
              </>
            )}
          </span>
        </span>
      )}
    </div>
  );
}
