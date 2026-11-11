"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { proposeTrade, respondToTrade, vetoTrade } from "@/app/leagues/[id]/trades/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { FoldCard } from "@/components/fold-card";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatPoints, roundPoints } from "@/lib/format-points";
import { formatEpisodeCasual } from "@/lib/format-week";
import {
  isTradeFailure,
  TRADE_FAILURE_COPY,
  TRADE_RULES,
  tradeDraftProblem,
  tradePartyIds,
  tradeSides,
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

// Offers waiting on the viewer first, then the trades up for veto, then the
// form; the log and the rules fold away under them.
export function TradesPanel({
  leagueId,
  historyFrom,
  teamId,
  managerNames,
  coupleDisplayNames,
  behind,
  pendingRevealWeek,
  closed,
  nextRun,
  cashRoom,
  rosters,
  offers,
  waiting,
  log,
}: {
  leagueId: string;
  historyFrom: string;
  teamId: string;
  managerNames: Record<string, string>;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  // A viewer who hasn't watched the latest results can't be shown who is
  // still dancing, so offers and rosters wait until they catch up.
  behind: boolean;
  pendingRevealWeek: number | null;
  // Past the Semi-Finals lock, or no waiver run left for a trade to take
  // effect at.
  closed: boolean;
  nextRun: { weekNumber: number; dueAt: string | null; startWeek: number } | null;
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
  const [withId, setWithId] = useState("");
  // The usual trade is two managers, as two boxes; "Add another manager"
  // opens the who-sends-what form that builds any trade one part at a time.
  const [multi, setMulti] = useState(false);
  const [picker, setPicker] = useState<"give" | "get" | null>(null);
  const [fromId, setFromId] = useState(teamId);
  const [toId, setToId] = useState("");
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  const runText = useFormattedDeadline(nextRun?.dueAt);

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
            <CoupleNameLink coupleId={leg.coupleId} from={historyFrom} {...parts(leg.coupleId)} />
          ) : (
            coupleNameNode(parts(leg.coupleId))
          )}
        </li>
      ))}
    </ul>
  );

  // A two-manager trade the viewer is in reads as what they give and get;
  // anything else lists its parts.
  const tradeBody = (trade: { legs: TradeLeg[] }, linked: boolean) => {
    const partyIds = tradePartyIds(trade.legs);
    if (partyIds.length !== 2 || !partyIds.includes(teamId)) return legLines(trade, linked);
    const sides = tradeSides(trade.legs);
    const side = (managerId: string) => sides.find((s) => s.managerId === managerId);
    const mine = side(teamId);
    const theirs = side(partyIds.find((id) => id !== teamId)!);
    const box = (label: string, s: typeof mine) => (
      <div className="flex flex-col gap-1 rounded-xl border border-border px-2.5 py-2 text-sm [&_a]:no-underline [&_a]:hover:text-accent">
        <span className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">{label}</span>
        {s?.coupleIds.map((coupleId) => (
          <span key={coupleId} className="font-medium">
            {linked ? <CoupleNameLink coupleId={coupleId} from={historyFrom} {...parts(coupleId)} /> : coupleNameNode(parts(coupleId))}
          </span>
        ))}
        {s && s.points > 0 && <span className="text-muted-foreground">{formatPoints(s.points)} pts</span>}
        {(!s || (s.coupleIds.length === 0 && s.points === 0)) && <span className="text-muted-foreground">Nothing</span>}
      </div>
    );
    return (
      <div className="grid grid-cols-2 gap-2">
        {box("You give", mine)}
        {box("You get", theirs)}
      </div>
    );
  };

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
  const couplesOf = (managerId: string) =>
    (rosters.find((roster) => roster.managerId === managerId)?.coupleIds ?? []).filter(
      (coupleId) => !movingCoupleIds.has(coupleId)
    );
  const fromCouples = couplesOf(fromId);
  const whatItems: Record<string, ReactNode> = {
    "": CHOOSE_WHAT,
    ...Object.fromEntries(fromCouples.map((coupleId) => [coupleId, coupleNameNode(parts(coupleId))])),
    [POINTS]: "Points",
  };
  const pointsAmount = roundPoints(Number(amount));
  const partReady = fromId !== "" && toId !== "" && what !== "" && (what !== POINTS || pointsAmount > 0);
  const draftProblem = tradeDraftProblem(legs, teamId);
  const others = tradePartyIds(legs).filter((managerId) => managerId !== teamId);
  const give = legs.filter((leg) => leg.fromManagerId === teamId);
  const get = legs.filter((leg) => leg.toManagerId === teamId);
  // The side the picker is adding to: what the viewer gives comes off their
  // own roster, what they get off the other manager's.
  const pickerFrom = picker === "give" ? teamId : withId;
  const pickerTo = picker === "give" ? withId : teamId;

  function addLeg(leg: TradeLeg) {
    setError(null);
    setLegs([...legs, leg]);
  }

  function addPart() {
    addLeg(
      what === POINTS
        ? { fromManagerId: fromId, toManagerId: toId, coupleId: null, points: pointsAmount }
        : { fromManagerId: fromId, toManagerId: toId, coupleId: what, points: null }
    );
    setWhat("");
    setAmount("");
  }

  function pickCouple(coupleId: string) {
    addLeg({ fromManagerId: pickerFrom, toManagerId: pickerTo, coupleId, points: null });
    setPicker(null);
  }

  function pickPoints() {
    if (pointsAmount <= 0) return;
    addLeg({ fromManagerId: pickerFrom, toManagerId: pickerTo, coupleId: null, points: pointsAmount });
    setAmount("");
    setPicker(null);
  }

  function chooseWith(managerId: string) {
    setWithId(managerId);
    setLegs([]);
    setError(null);
  }

  async function sendOffer() {
    if (await run(BUILDER, () => proposeTrade(leagueId, legs))) {
      setLegs([]);
      setWithId("");
      setMulti(false);
      setFromId(teamId);
      setToId("");
    }
  }

  const removeLeg = (leg: TradeLeg) => (
    <Button variant="ghost" size="icon-sm" aria-label="Remove" disabled={busy} onClick={() => setLegs(legs.filter((l) => l !== leg))}>
      <XIcon />
    </Button>
  );
  const legText = (leg: TradeLeg) => (leg.coupleId ? coupleNameNode(parts(leg.coupleId)) : `${formatPoints(leg.points ?? 0)} pts`);
  const sideBox = (label: string, side: "give" | "get", items: TradeLeg[]) => (
    <div className="flex flex-col gap-1 rounded-xl border border-border px-2.5 py-2 text-sm">
      <span className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">{label}</span>
      {items.map((leg, index) => (
        <span key={index} className="flex items-center justify-between gap-1 font-medium [overflow-wrap:anywhere]">
          <span className="min-w-0">{legText(leg)}</span>
          {removeLeg(leg)}
        </span>
      ))}
      <button
        type="button"
        disabled={!withId || busy}
        onClick={() => setPicker(side)}
        className="self-start text-left text-xs font-semibold text-accent disabled:opacity-50"
      >
        + Add a Couple or Points
      </button>
    </div>
  );

  return (
    <>
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

      {offers.map((offer) => {
        const mine = offer.parties.find((party) => party.managerId === teamId);
        const needsMe = !!mine && !mine.accepted;
        const otherNames = offer.parties.filter((party) => party.managerId !== teamId).map((party) => managerName(party.managerId));
        return (
          <Card key={offer.id} className={cn(needsMe && "ring-accent/60")}>
            <CardHeader>
              <CardTitle>
                {offer.proposedBy === teamId ? `Your Offer to ${listNames(otherNames)}` : `Offer From ${managerName(offer.proposedBy)}`}
              </CardTitle>
              <OfferStatus offer={offer} nameOf={(managerId) => (managerId === teamId ? "you" : managerName(managerId))} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tradeBody(offer, true)}
              {errorAt(offer.id)}
              <div className="flex gap-2">
                {needsMe && (
                  <Button size="sm" disabled={busy || closed} onClick={() => void run(offer.id, () => respondToTrade(leagueId, offer.id, true))}>
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
            </CardContent>
          </Card>
        );
      })}

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
                {tradeBody(trade, true)}
                <VetoStatus trade={trade} votesNeeded={vetoVotesNeeded(teamCount, trade.parties.length)} runText={runText} />
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

      {!behind && closed && (
        <Card>
          <CardHeader>
            <CardTitle>Trades Are Closed</CardTitle>
            <CardDescription>
              {nextRun ? "Offers closed at the Semi-Finals lock." : "There is no waiver run left for a trade to take effect at."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!behind && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Propose a Trade</CardTitle>
            <CardDescription>
              {cashRoom > 0 ? `You can send up to ${formatPoints(cashRoom)} pts.` : "You have no points to send right now."}
              {nextRun && ` A trade that goes through starts in ${formatEpisodeCasual(nextRun.startWeek)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!multi ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="trade-with">With</Label>
                  <Select items={managerItems} value={withId} onValueChange={(v) => chooseWith(v ?? "")}>
                    <SelectTrigger id="trade-with" className="w-full">
                      <SelectValue placeholder={CHOOSE_MANAGER} />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {rosters
                        .filter((roster) => roster.managerId !== teamId)
                        .map((roster) => (
                          <SelectItem key={roster.managerId} value={roster.managerId}>
                            {managerItems[roster.managerId]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sideBox("You give", "give", give)}
                  {sideBox("You get", "get", get)}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMulti(true);
                    setToId(withId);
                    setAmount("");
                  }}
                  className="self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  + Add Another Manager
                </button>
              </>
            ) : (
              <>
                {legs.length > 0 && (
                  <ul className="flex flex-col text-sm">
                    {legs.map((leg, index) => (
                      <li key={index} className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
                        <span className="min-w-0 flex-1">{legLines({ legs: [leg] }, false)}</span>
                        {removeLeg(leg)}
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
              </>
            )}

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
            {legs.length === 0 && errorAt(BUILDER)}
          </CardContent>
        </Card>
      )}

      <Sheet open={picker != null} onOpenChange={(open) => !open && setPicker(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-3 overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">
              {picker === "give" ? "What You Give" : "What You Get"}
            </SheetTitle>
            <SheetDescription>
              {picker === "give"
                ? `A couple from your roster, or points, to ${withId ? managerName(withId) : "them"}.`
                : `A couple from ${withId ? managerName(withId) : "their"}'s roster, or points.`}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            {picker &&
              couplesOf(pickerFrom).map((coupleId) => (
                <Button key={coupleId} variant="outline" className="justify-start" disabled={busy} onClick={() => pickCouple(coupleId)}>
                  {coupleNameNode(parts(coupleId))}
                </Button>
              ))}
            {picker && couplesOf(pickerFrom).length === 0 && (
              <p className="text-sm text-muted-foreground">No couple left to add from that roster.</p>
            )}
            <div className="flex items-end gap-2 border-t border-border pt-3">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="trade-side-points">Points</Label>
                <Input
                  id="trade-side-points"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button variant="outline" disabled={busy || pointsAmount <= 0} onClick={pickPoints}>
                Add Points
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <FoldCard title="Trade Log" note={log.length === 0 ? "None yet" : `${log.length} in this league`}>
        <div className="flex flex-col text-sm">
          {log.length === 0 && <p className="text-muted-foreground">No trade has gone through this league yet.</p>}
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
        </div>
      </FoldCard>

      <FoldCard title="How Trades Work">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
          {TRADE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </FoldCard>
    </>
  );
}

function OfferStatus({ offer, nameOf }: { offer: TradeView; nameOf: (managerId: string) => string }) {
  const expiresAt = useFormattedDeadline(offer.expiresAt);
  const waitingOn = offer.parties.filter((party) => !party.accepted).map((party) => nameOf(party.managerId));
  return (
    <CardDescription>
      Waiting on {listNames(waitingOn)}
      {expiresAt && ` · Ends ${expiresAt}`}. Private until everyone accepts; then it can&apos;t be called off.
    </CardDescription>
  );
}

function VetoStatus({ trade, votesNeeded, runText }: { trade: TradeView; votesNeeded: number | null; runText: string }) {
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
