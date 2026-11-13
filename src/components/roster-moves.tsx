"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { ChevronRightIcon, CircleCheckIcon, CircleDashedIcon, HourglassIcon } from "lucide-react";
import { CoupleName } from "@/components/couple-name";
import { RosterMovesSwitch } from "@/components/roster-moves-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { defaultRosterMoveTab, type RosterMoves as RosterMovesState, type RosterMoveTab } from "@/lib/league-triage";
import { rosterMoveTabHref } from "@/lib/roster-moves-pages";
import { inSentence, useFormattedDeadline } from "@/lib/use-browser-time-zone";

type Moves = RosterMovesState<CoupleNameParts>;

// Lifeline, Recast and Trades are separate commissioner switches, so a league
// shows only the ones it has on, as one switch (the same one their pages
// carry) over the selected move's lines and a link to its page. The card
// sits outside Your Fantasy Roster because its lines are about the weeks
// still to come, not the roster's paged week, so each line names its own.
// A viewer who is behind gets the catch-up cards instead, since an open spot
// says a couple went home.
export function RosterMoves({
  leagueId,
  tabs,
  moves,
  managerNames,
  from,
}: {
  leagueId: string;
  tabs: RosterMoveTab[];
  moves: Moves;
  managerNames: Record<string, string>;
  from: string;
}) {
  const [picked, setPicked] = useState(defaultRosterMoveTab(tabs));
  const selected = tabs.some((tab) => tab.key === picked) ? picked : defaultRosterMoveTab(tabs);
  if (!selected) return null;
  const tab = tabs.find((item) => item.key === selected)!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tabs.length > 1 && <RosterMovesSwitch tabs={tabs} selected={selected} onSelect={setPicked} />}
        {selected === "lifeline" ? (
          <LifelineStatusLines lifeline={moves.lifeline} />
        ) : selected === "recast" ? (
          <WaiverClaimsStatus waivers={moves.waivers} />
        ) : (
          <TradesStatusLines trades={moves.trades} managerNames={managerNames} />
        )}
        <Link
          href={rosterMoveTabHref(leagueId, selected, from)}
          className="flex items-center gap-0.5 self-end text-sm font-semibold text-accent no-underline hover:underline"
        >
          Open {tab.label}
          <ChevronRightIcon aria-hidden className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

const ICON = "mt-px size-3.5 shrink-0";
const LINES = "flex flex-col gap-1 text-xs text-muted-foreground";

function LifelineStatusLines({ lifeline }: { lifeline: Moves["lifeline"] }) {
  const formattedLockAt = useFormattedDeadline(lifeline?.lockAt);
  if (!lifeline) return <p className={LINES}>Nothing to pick this week.</p>;
  const { spots, weekNumber, locked } = lifeline;
  const week = formatEpisodeCasual(weekNumber);
  const saved = spots.filter((spot) => spot.pick).length;
  const savedPart =
    saved === 0 ? (locked ? "None saved" : null) : saved < spots.length ? `${saved} of ${spots.length} saved` : "Saved";
  const lockPart = locked ? `${week} locked` : formattedLockAt ? `${week} locks ${inSentence(formattedLockAt)}` : null;
  const statusLine = [savedPart, lockPart].filter(Boolean).join(" · ");

  return (
    <div className={LINES}>
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
              {spots.length === 1 ? "1 open spot" : `${spots.length} open spots`} · No Lifeline saved
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

function WaiverClaimsStatus({ waivers }: { waivers: Moves["waivers"] }) {
  const due = useFormattedDeadline(waivers?.dueAt);
  if (!waivers) return <p className={LINES}>No waiver run to come.</p>;
  const { claims, openSpotCount, dueAt, weekNumber, startWeek } = waivers;
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
    <div className={LINES}>
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

function TradesStatusLines({ trades, managerNames }: { trades: Moves["trades"]; managerNames: Record<string, string> }) {
  if (!trades || (trades.offers.length === 0 && trades.accepted.length === 0 && trades.vetoes.length === 0)) {
    return <p className={LINES}>No offer waiting on you.</p>;
  }
  const name = (managerId: string) => managerNames[managerId] ?? "Someone";
  const names = (managerIds: string[]) =>
    managerIds.length > 2 ? `${managerIds.length} managers` : managerIds.map(name).join(" and ");
  return (
    <ul className={LINES}>
      {trades.offers.map((offer, index) => (
        <OfferLine key={index} from={name(offer.from)} expiresAt={offer.expiresAt} />
      ))}
      {trades.vetoes.map((veto, index) => (
        <VetoLine key={index} between={names(veto.between)} vetoEndsAt={veto.vetoEndsAt} voted={veto.voted} />
      ))}
      {trades.accepted.map((trade, index) => (
        <AcceptedLine key={index} with={names(trade.with)} vetoEndsAt={trade.vetoEndsAt} />
      ))}
    </ul>
  );
}

// Everyone outside a trade gets a say for 24 hours, so an open window is a
// gold line until the viewer has voted; their own accepted trade waits on
// the window, not on a run.
function VetoLine({ between, vetoEndsAt, voted }: { between: string; vetoEndsAt: string; voted: boolean }) {
  const ends = useFormattedDeadline(vetoEndsAt);
  // "Kim and Pat's trade", but "the trade between 3 managers".
  const trade = between.endsWith(" managers") ? `the trade between ${between}` : `${between}'s trade`;
  if (voted) {
    return (
      <li className="flex gap-1.5">
        <HourglassIcon aria-hidden className={cn(ICON, "text-accent")} />
        <span className="min-w-0">
          <span className="text-foreground">{trade}</span>, up for veto · You voted
        </span>
      </li>
    );
  }
  return (
    <li className="flex gap-1.5 font-semibold text-accent">
      <CircleDashedIcon aria-hidden className={ICON} />
      <span className="min-w-0">
        {trade} is up for veto
        {ends && <span className="font-normal text-muted-foreground"> · Ends {inSentence(ends)}</span>}
      </span>
    </li>
  );
}

// A window that has closed on a live night waits for the results.
function AcceptedLine({ with: withNames, vetoEndsAt }: { with: string; vetoEndsAt: string }) {
  const clears = useFormattedDeadline(vetoEndsAt);
  const past = new Date(vetoEndsAt).getTime() <= Date.now();
  return (
    <li className="flex gap-1.5">
      <HourglassIcon aria-hidden className={cn(ICON, "text-accent")} />
      <span className="min-w-0">
        <span className="text-foreground">Trade with {withNames}</span>, accepted
        {past ? " · Clears once results are posted" : clears && ` · Clears ${inSentence(clears)}`}
      </span>
    </li>
  );
}

function OfferLine({ from, expiresAt }: { from: string; expiresAt: string }) {
  const ends = useFormattedDeadline(expiresAt);
  return (
    <li className="flex gap-1.5 font-semibold text-accent">
      <CircleDashedIcon aria-hidden className={ICON} />
      <span className="min-w-0">
        Offer from {from} is waiting on you
        {ends && <span className="font-normal text-muted-foreground"> · Ends {inSentence(ends)}</span>}
      </span>
    </li>
  );
}
