"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { proposeTrade, respondToTrade, vetoTrade } from "@/app/leagues/[id]/trades/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatPoints, roundPoints } from "@/lib/format-points";
import { formatEpisodeCasual } from "@/lib/format-week";
import {
  isTradeFailure,
  TRADE_FAILURE_COPY,
  TRADE_RULES,
  tradeDraftProblem,
  tradePartyIds,
  vetoVotesNeeded,
  type TradeLeg,
  type TradeStatus,
} from "@/lib/trades";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type TradeView = {
  id: string;
  proposedBy: string;
  status: TradeStatus;
  result: string | null;
  expiresAt: string;
  vetoEndsAt: string | null;
  // Whether the league can still vote, and whether the window closes in time
  // for the next waiver run (null without one).
  vetoOpen: boolean;
  clearsNextRun: boolean | null;
  weekNumber: number | null;
  startWeek: number | null;
  legs: TradeLeg[];
  parties: { managerId: string; accepted: boolean }[];
  vetoVotes: string[];
};
export type TradeRoster = { managerId: string; coupleIds: string[] };

const UNKNOWN_COUPLE: CoupleNameParts = { celebrity: "Unknown", pro: "Unknown" };
const CHOOSE_MANAGER = "Choose a manager…";
const CHOOSE_WHAT = "Choose what they send…";
const POINTS = "points";
const BUILDER = "builder";

const LOG_STATUS_COPY: Partial<Record<TradeStatus, string>> = {
  vetoed: "Vetoed by the league.",
  declined: "Declined.",
  cancelled: "Cancelled.",
  expired: "Expired before everyone accepted.",
};

function listNames(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

export function TradesPanel({
  leagueId,
  closeHref,
  teamId,
  managerNames,
  coupleDisplayNames,
  behind,
  pendingRevealWeek,
  deadline,
  closed,
  nextRun,
  cashRoom,
  rosters,
  offers,
  waiting,
  log,
}: {
  leagueId: string;
  closeHref: string;
  teamId: string;
  managerNames: Record<string, string>;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  // A viewer who hasn't watched the latest results can't be shown who is
  // still dancing, so offers and rosters wait until they catch up.
  behind: boolean;
  pendingRevealWeek: number | null;
  deadline: string | null;
  // Past the Semi-Finals lock, or no waiver run left for a trade to take
  // effect at.
  closed: boolean;
  nextRun: { dueAt: string; startWeek: number } | null;
  // Points the viewer's team can still send this season.
  cashRoom: number;
  // Every team's couples still dancing, the viewer's team first.
  rosters: TradeRoster[];
  offers: TradeView[];
  waiting: TradeView[];
  log: TradeView[];
}) {
  const router = useRouter();
  const [legs, setLegs] = useState<TradeLeg[]>([]);
  const [fromId, setFromId] = useState(teamId);
  const [toId, setToId] = useState("");
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  const deadlineText = useFormattedDeadline(deadline);
  const runText = useFormattedDeadline(nextRun?.dueAt);

  const from = `/leagues/${leagueId}/trades`;
  const parts = (coupleId: string) => coupleDisplayNames[coupleId] ?? UNKNOWN_COUPLE;
  const managerName = (managerId: string) => managerNames[managerId] ?? "Unknown";
  const teamCount = Object.keys(managerNames).length;

  async function run(at: string, action: () => Promise<{ error: string | null }>) {
    setError(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    router.refresh();
    if (result.error) setError({ at, message: result.error });
    return !result.error;
  }

  const errorAt = (at: string) =>
    error?.at === at && (
      <p role="alert" className="text-sm text-danger-text">
        {error.message}
      </p>
    );

  const legLines = (trade: { legs: TradeLeg[] }, linked: boolean) => (
    <ul className="flex flex-col gap-1 [&_a]:no-underline [&_a]:hover:text-accent">
      {trade.legs.map((leg, index) => (
        <li key={index} className="[overflow-wrap:anywhere]">
          <span className="font-medium">
            {leg.fromManagerId === teamId ? "You send" : `${managerName(leg.fromManagerId)} sends`}{" "}
            {leg.toManagerId === teamId ? "you" : managerName(leg.toManagerId)}
          </span>{" "}
          {leg.coupleId == null ? (
            `${formatPoints(leg.points ?? 0)} pts`
          ) : linked ? (
            <CoupleNameLink coupleId={leg.coupleId} from={from} {...parts(leg.coupleId)} />
          ) : (
            coupleNameNode(parts(leg.coupleId))
          )}
        </li>
      ))}
    </ul>
  );

  const managerItems: Record<string, ReactNode> = {
    "": CHOOSE_MANAGER,
    ...Object.fromEntries(
      rosters.map((roster) => [
        roster.managerId,
        roster.managerId === teamId ? `${managerName(teamId)} (You)` : managerName(roster.managerId),
      ])
    ),
  };
  const movingCoupleIds = new Set(legs.flatMap((leg) => (leg.coupleId ? [leg.coupleId] : [])));
  const fromCouples = (rosters.find((roster) => roster.managerId === fromId)?.coupleIds ?? []).filter(
    (coupleId) => !movingCoupleIds.has(coupleId)
  );
  const whatItems: Record<string, ReactNode> = {
    "": CHOOSE_WHAT,
    ...Object.fromEntries(fromCouples.map((coupleId) => [coupleId, coupleNameNode(parts(coupleId))])),
    [POINTS]: "Points",
  };
  const pointsAmount = roundPoints(Number(amount));
  const partReady = fromId !== "" && toId !== "" && what !== "" && (what !== POINTS || pointsAmount > 0);
  const draftProblem = tradeDraftProblem(legs, teamId);
  const others = tradePartyIds(legs).filter((managerId) => managerId !== teamId);

  function addPart() {
    setError(null);
    setLegs([
      ...legs,
      what === POINTS
        ? { fromManagerId: fromId, toManagerId: toId, coupleId: null, points: pointsAmount }
        : { fromManagerId: fromId, toManagerId: toId, coupleId: what, points: null },
    ]);
    setWhat("");
    setAmount("");
  }

  async function sendOffer() {
    if (await run(BUILDER, () => proposeTrade(leagueId, legs))) {
      setLegs([]);
      setFromId(teamId);
      setToId("");
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-12">
      <Link href={closeHref} aria-label="Close" className="self-start text-muted-foreground hover:text-foreground">
        <XIcon className="size-5" />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trades</h1>
        <p className="mt-1 text-sm text-muted-foreground">Swap couples, and points, with other managers.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {closed
            ? "Trades are closed for the season."
            : deadlineText
              ? `Offers have to be accepted by ${deadlineText}, the Semi-Finals lock.`
              : null}
        </p>
        {!closed && nextRun && runText && (
          <p className="mt-1 text-sm text-muted-foreground">
            Next waiver run: {runText}. A trade that takes effect then starts in {formatEpisodeCasual(nextRun.startWeek)}.
          </p>
        )}
      </div>

      {behind && (
        <Card>
          <CardHeader>
            <CardTitle>Catch Up to Trade</CardTitle>
            <CardDescription>
              Mark the latest week as watched to see offers and propose a trade. We won&apos;t name anyone until then.
            </CardDescription>
          </CardHeader>
          {pendingRevealWeek != null && (
            <CardContent>
              <MarkWeekWatchedButton weekNumber={pendingRevealWeek} />
            </CardContent>
          )}
        </Card>
      )}

      {offers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Offers</CardTitle>
            <CardDescription>
              Only the managers in an offer can see it. Once everyone in it accepts, it can&apos;t be called off.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col text-sm">
            {offers.map((offer) => {
              const mine = offer.parties.find((party) => party.managerId === teamId);
              return (
                <div key={offer.id} className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
                  {legLines(offer, true)}
                  <OfferStatus offer={offer} nameOf={(managerId) => (managerId === teamId ? "you" : managerName(managerId))} />
                  {errorAt(offer.id)}
                  <div className="flex gap-2">
                    {mine && !mine.accepted && (
                      <Button
                        size="sm"
                        disabled={busy || closed}
                        onClick={() => void run(offer.id, () => respondToTrade(leagueId, offer.id, true))}
                      >
                        Accept
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(offer.id, () => respondToTrade(leagueId, offer.id, false))}
                    >
                      {offer.proposedBy === teamId ? "Cancel Offer" : "Decline"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Up for Veto</CardTitle>
            <CardDescription>
              Accepted by everyone in them. The league has 24 hours to veto a trade before it can take effect.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col text-sm">
            {waiting.map((trade) => (
              <div key={trade.id} className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
                {legLines(trade, true)}
                <VetoStatus
                  trade={trade}
                  votesNeeded={vetoVotesNeeded(teamCount, trade.parties.length)}
                  runText={runText}
                />
                {errorAt(trade.id)}
                {trade.vetoOpen &&
                  vetoVotesNeeded(teamCount, trade.parties.length) != null &&
                  !trade.parties.some((party) => party.managerId === teamId) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      disabled={busy || trade.vetoVotes.includes(teamId)}
                      onClick={() => void run(trade.id, () => vetoTrade(leagueId, trade.id))}
                    >
                      {trade.vetoVotes.includes(teamId) ? "You Voted to Veto" : "Vote to Veto"}
                    </Button>
                  )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!behind && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Propose a Trade</CardTitle>
            <CardDescription>
              Add each part of the trade: who sends what to whom.{" "}
              {cashRoom > 0
                ? `You can send up to ${formatPoints(cashRoom)} pts right now.`
                : "You have no points to send right now."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {legs.length > 0 && (
              <ul className="flex flex-col text-sm">
                {legs.map((leg, index) => (
                  <li key={index} className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
                    <span className="min-w-0 flex-1">{legLines({ legs: [leg] }, false)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove part"
                      disabled={busy}
                      onClick={() => setLegs(legs.filter((_, at) => at !== index))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className={legs.length > 0 ? "flex flex-col gap-3 border-t border-border pt-3" : "flex flex-col gap-3"}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="trade-from">From</Label>
                <Select
                  items={managerItems}
                  value={fromId}
                  onValueChange={(v) => {
                    setFromId(v ?? "");
                    setWhat("");
                    if (v === toId) setToId("");
                  }}
                >
                  <SelectTrigger id="trade-from" className="w-full">
                    <SelectValue placeholder={CHOOSE_MANAGER} />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {rosters.map((roster) => (
                      <SelectItem key={roster.managerId} value={roster.managerId}>
                        {managerItems[roster.managerId]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="trade-to">To</Label>
                <Select items={managerItems} value={toId} onValueChange={(v) => setToId(v ?? "")}>
                  <SelectTrigger id="trade-to" className="w-full">
                    <SelectValue placeholder={CHOOSE_MANAGER} />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {rosters
                      .filter((roster) => roster.managerId !== fromId)
                      .map((roster) => (
                        <SelectItem key={roster.managerId} value={roster.managerId}>
                          {managerItems[roster.managerId]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="trade-what">Sends</Label>
                <Select items={whatItems} value={what} onValueChange={(v) => setWhat(v ?? "")}>
                  <SelectTrigger id="trade-what" className="w-full">
                    <SelectValue placeholder={CHOOSE_WHAT} />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {fromCouples.map((coupleId) => (
                      <SelectItem key={coupleId} value={coupleId}>
                        {whatItems[coupleId]}
                      </SelectItem>
                    ))}
                    <SelectItem value={POINTS}>Points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {what === POINTS && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="trade-points">Points</Label>
                  <Input
                    id="trade-points"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              )}
              <Button variant="outline" className="self-start" disabled={busy || !partReady} onClick={addPart}>
                Add to Trade
              </Button>
            </div>

            {legs.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">
                  {draftProblem
                    ? `${draftProblem}.`
                    : `${listNames(others.map(managerName))} will have to accept. Once everyone has, it can't be called off.`}
                </p>
                {errorAt(BUILDER)}
                <Button className="self-start" disabled={busy || draftProblem != null} onClick={() => void sendOffer()}>
                  {busy ? "Sending…" : "Send Offer"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trade Log</CardTitle>
          <CardDescription>Every trade the league has seen, and your own offers that ended.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col text-sm">
          {log.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
          {log.map((trade) => (
            <div key={trade.id} className="flex flex-col gap-1 border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0">
              {legLines(trade, true)}
              <span className="text-xs text-muted-foreground">
                {trade.status === "executed" && trade.weekNumber != null
                  ? `After ${formatEpisodeCasual(trade.weekNumber)}${trade.startWeek != null ? ` · starts ${formatEpisodeCasual(trade.startWeek)}` : ""}`
                  : trade.status === "failed"
                    ? `Didn't go through. ${isTradeFailure(trade.result) ? TRADE_FAILURE_COPY[trade.result] : ""}`
                    : LOG_STATUS_COPY[trade.status]}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Trades Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
            {TRADE_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function OfferStatus({ offer, nameOf }: { offer: TradeView; nameOf: (managerId: string) => string }) {
  const expiresAt = useFormattedDeadline(offer.expiresAt);
  const waitingOn = offer.parties.filter((party) => !party.accepted).map((party) => nameOf(party.managerId));
  return (
    <p className="text-xs text-muted-foreground">
      Offered by {nameOf(offer.proposedBy)} · Waiting on {listNames(waitingOn)}
      {expiresAt && ` · Expires ${expiresAt}`}
    </p>
  );
}

function VetoStatus({
  trade,
  votesNeeded,
  runText,
}: {
  trade: TradeView;
  votesNeeded: number | null;
  runText: string;
}) {
  const vetoEndsAt = useFormattedDeadline(trade.vetoEndsAt);
  const votes =
    votesNeeded == null
      ? "Every team is in this trade, so there is no one to veto it."
      : `${trade.vetoVotes.length} of the ${votesNeeded} veto ${votesNeeded === 1 ? "vote" : "votes"} it would take.`;
  const effect =
    trade.clearsNextRun == null
      ? null
      : trade.clearsNextRun
        ? `Takes effect at the next waiver run${runText ? `, ${runText}` : ""}.`
        : "Its veto window closes after the next waiver run, so it takes effect at the one after.";
  return (
    <p className="text-xs text-muted-foreground">
      {trade.vetoOpen ? `Veto window closes ${vetoEndsAt}.` : "Veto window closed."} {votes} {effect}
    </p>
  );
}
