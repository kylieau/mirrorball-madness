"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { saveRecastList } from "@/app/leagues/[id]/waivers/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { FoldCard } from "@/components/fold-card";
import { RecastCatchUpCard } from "@/components/recast-catch-up-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { YouPill } from "@/components/you-pill";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatPoints } from "@/lib/format-points";
import { formatEpisodeCasual } from "@/lib/format-week";
import {
  moveRecastClaim,
  RECAST_MISS_COPY,
  RECAST_RULES,
  type RecastClaim,
  type RecastMiss,
  type RecastOrderEntry,
  type RecastWireEntry,
} from "@/lib/recast";

export type RecastNextRun = {
  weekNumber: number;
  // Null until the week's results are posted; the run is 48 hours after.
  dueAt: string | null;
  startWeek: number | null;
};
// An open spot with no couple was emptied by a trade.
export type RecastSpot = { slotNumber: number; coupleId: string | null; open: boolean };
export type RecastLogLine = {
  id: string;
  managerId: string;
  coupleId: string;
  dropCoupleId: string | null;
  weekNumber: number;
  startWeek: number | null;
};
// A couple a departed manager held, nobody's from weekNumber. The name is
// as stored at release time, since the league no longer knows them.
export type RecastReleaseLine = { id: string; managerName: string; coupleId: string; weekNumber: number };

const UNKNOWN_COUPLE: CoupleNameParts = { celebrity: "Unknown", pro: "Unknown" };

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4] ?? "th"}`;

// The viewer's list first, then the wire it claims from; the order, the log
// and the rules fold away under them.
export function RecastPanel({
  leagueId,
  historyFrom,
  nextRun,
  pendingRevealWeek,
  behind,
  list,
  spots,
  wire,
  order,
  orderThroughWeek,
  teamId,
  managerNames,
  coupleDisplayNames,
  misses,
  log,
  releases,
}: {
  leagueId: string;
  historyFrom: string;
  nextRun: RecastNextRun | null;
  pendingRevealWeek: number | null;
  // A viewer who hasn't watched the latest results can't be shown who is
  // still dancing, so the list and the wire wait until they catch up.
  behind: boolean;
  list: RecastClaim[];
  // The viewer's current roster spots: open ones to fill, living couples to drop.
  spots: RecastSpot[];
  wire: RecastWireEntry[];
  order: RecastOrderEntry[];
  orderThroughWeek: number | null;
  teamId: string;
  managerNames: Record<string, string>;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  misses: { coupleId: string; result: RecastMiss }[];
  log: RecastLogLine[];
  releases: RecastReleaseLine[];
}) {
  const router = useRouter();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parts = (coupleId: string) => coupleDisplayNames[coupleId] ?? UNKNOWN_COUPLE;
  const name = (coupleId: string) => coupleNameNode(parts(coupleId));
  const managerName = (managerId: string) => managerNames[managerId] ?? "Unknown";
  const spotBySlot = new Map(spots.map((spot) => [spot.slotNumber, spot]));
  const spotLabel = (spot: RecastSpot): ReactNode =>
    spot.coupleId == null ? (
      "Open Spot"
    ) : spot.open ? (
      <>Open Spot (was {name(spot.coupleId)})</>
    ) : (
      <>Drop {name(spot.coupleId)}</>
    );
  const rankOnList = (coupleId: string) => {
    const at = list.findIndex((claim) => claim.coupleId === coupleId);
    return at === -1 ? null : at + 1;
  };
  // The same couple can be claimed for another spot as a fallback.
  const listedSlots = (coupleId: string) =>
    new Set(list.filter((claim) => claim.coupleId === coupleId).map((claim) => claim.slotNumber));
  const canClaimMore = (coupleId: string) => spots.some((spot) => !listedSlots(coupleId).has(spot.slotNumber));
  const myTurn = order.findIndex((entry) => entry.managerId === teamId) + 1;

  async function save(next: RecastClaim[]) {
    setError(null);
    setSaving(true);
    const result = await saveRecastList(leagueId, next);
    setSaving(false);
    router.refresh();
    if (result.error) setError(result.error);
    return !result.error;
  }

  async function claim(coupleId: string, spot: RecastSpot) {
    setClaiming(null);
    await save([...list, { coupleId, slotNumber: spot.slotNumber, dropCoupleId: spot.open ? null : spot.coupleId }]);
  }

  const canClaim = !behind && nextRun != null;

  return (
    <>
      {behind && <RecastCatchUpCard pendingRevealWeek={pendingRevealWeek} />}
      {!behind && !nextRun && (
        <Card>
          <CardHeader>
            <CardTitle>No Waiver Runs Left</CardTitle>
            <CardDescription>There is no waiver run after the Finale, so the wire is closed for the season.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {canClaim && (
        <Card>
          <CardHeader>
            <CardTitle>Your Waiver List</CardTitle>
            <CardDescription>
              Private until the run. Your turn takes your highest claim that can still win; a drop only happens if its
              claim does.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error && (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            )}
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {wire.length > 0 ? "No claims yet. Tap Claim on a couple below." : "No claims yet."}
              </p>
            ) : (
              <ol className="flex flex-col">
                {list.map((claim, index) => {
                  const spot = spotBySlot.get(claim.slotNumber);
                  return (
                    <li
                      key={`${claim.coupleId}:${claim.slotNumber}`}
                      className="flex items-center gap-3 border-b border-border py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <span className="w-5 shrink-0 font-rank text-base text-muted-foreground">{index + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">Add {name(claim.coupleId)}</span>
                        <span className="text-xs text-muted-foreground">
                          {claim.dropCoupleId ? (
                            <>Drop {name(claim.dropCoupleId)}</>
                          ) : spot?.coupleId ? (
                            <>For your open spot (was {name(spot.coupleId)})</>
                          ) : (
                            "For your open spot"
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Move up"
                          disabled={saving || index === 0}
                          onClick={() => void save(moveRecastClaim(list, index, -1))}
                        >
                          <ChevronUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Move down"
                          disabled={saving || index === list.length - 1}
                          onClick={() => void save(moveRecastClaim(list, index, 1))}
                        >
                          <ChevronDownIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove claim"
                          disabled={saving}
                          onClick={() => void save(list.filter((_, at) => at !== index))}
                        >
                          <XIcon />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {!behind && misses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Claims That Missed</CardTitle>
            <CardDescription>From the last waiver run. Only you can see these.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {misses.map((miss, index) => (
              <p key={index}>
                <span className="font-medium">{name(miss.coupleId)}</span>{" "}
                <span className="text-muted-foreground">{RECAST_MISS_COPY[miss.result]}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!behind && (
        <Card>
          <CardHeader>
            <CardTitle>The Wire</CardTitle>
            <CardDescription>
              {wire.length === 0
                ? "No couple is on the wire right now."
                : wire.length === 1
                  ? "1 couple you can claim."
                  : `${wire.length} couples you can claim.`}
            </CardDescription>
          </CardHeader>
          {wire.length > 0 && (
            <CardContent className="flex flex-col text-sm [&_a]:no-underline [&_a]:hover:text-accent">
              {wire.map((entry) => {
                const rank = rankOnList(entry.coupleId);
                return (
                  <div
                    key={entry.coupleId}
                    className="flex items-center justify-between gap-3 border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <CoupleNameLink coupleId={entry.coupleId} from={historyFrom} {...parts(entry.coupleId)} />
                      {entry.droppedBy && (
                        <span className="text-xs text-muted-foreground">
                          {managerName(entry.droppedBy)} may drop them in this run
                        </span>
                      )}
                    </span>
                    {rank != null ? (
                      <button
                        type="button"
                        disabled={saving || !canClaim || !canClaimMore(entry.coupleId)}
                        onClick={() => setClaiming(entry.coupleId)}
                        className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground disabled:opacity-100"
                      >
                        On your list · {rank}
                      </button>
                    ) : (
                      canClaim &&
                      spots.length > 0 && (
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => setClaiming(entry.coupleId)}>
                          Claim
                        </Button>
                      )
                    )}
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}

      <Sheet open={claiming != null} onOpenChange={(open) => !open && setClaiming(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-3 overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">
              {claiming && <>Claim {name(claiming)}</>}
            </SheetTitle>
            <SheetDescription>
              {spots.length === 1
                ? "They would take this spot. A drop only happens if the claim wins."
                : "Which spot would they take? A drop only happens if the claim wins."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            {spots.map((spot) => {
              const listed = claiming != null && listedSlots(claiming).has(spot.slotNumber);
              return (
                <Button
                  key={spot.slotNumber}
                  variant={spot.open ? "default" : "outline"}
                  className="justify-start"
                  disabled={saving || listed}
                  onClick={() => claiming && void claim(claiming, spot)}
                >
                  {spotLabel(spot)}
                  {listed && <span className="ml-auto text-xs font-normal">On your list</span>}
                </Button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {order.length > 0 && (
        <FoldCard title="Waiver Order" note={myTurn > 0 ? `You're ${ordinal(myTurn)} of ${order.length}` : undefined}>
          <p className="mb-3 text-xs text-muted-foreground">
            Reverse Dance Card standings{orderThroughWeek != null ? ` through ${formatEpisodeCasual(orderThroughWeek)}` : ""}:
            fewest Dance Card points first (Lifeline and trade points included), then the lower latest week, then the
            later draft pick. It is set when the run starts and says nothing about who gets whom.
          </p>
          <ol className="flex flex-col">
            {order.map((entry, index) => (
              <li
                key={entry.managerId}
                className="flex items-center gap-3 border-b border-border py-2 text-sm first:pt-0 last:border-b-0 last:pb-0"
              >
                <span className="w-5 shrink-0 font-rank text-base text-muted-foreground">{index + 1}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{managerName(entry.managerId)}</span>
                  {entry.managerId === teamId && <YouPill />}
                </span>
                <span className="shrink-0 font-heading">{formatPoints(entry.danceCardTotal)}</span>
              </li>
            ))}
          </ol>
        </FoldCard>
      )}

      <FoldCard title="Adds and Drops" note={log.length + releases.length === 0 ? "None yet" : `${log.length + releases.length} in this league`}>
        <div className="flex flex-col text-sm [&_a]:no-underline [&_a]:hover:text-accent">
          {log.length + releases.length === 0 && <p className="text-muted-foreground">No claim has been awarded in this league yet.</p>}
          {[
            ...log.map((line) => ({ key: line.id, week: line.weekNumber, line })),
            // A release sits with the week before it, the last one the manager held.
            ...releases.map((release) => ({ key: release.id, week: release.weekNumber - 1, release })),
          ]
            .sort((x, y) => y.week - x.week)
            .map((entry) => (
              <div key={entry.key} className="flex flex-col border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                {"release" in entry && entry.release ? (
                  <>
                    <span className="font-medium [overflow-wrap:anywhere]">{entry.release.managerName}</span>
                    <span>
                      Released <CoupleNameLink coupleId={entry.release.coupleId} from={historyFrom} {...parts(entry.release.coupleId)} />
                    </span>
                    <span className="text-xs text-muted-foreground">Left the league · free from {formatEpisodeCasual(entry.release.weekNumber)}</span>
                  </>
                ) : (
                  "line" in entry &&
                  entry.line && (
                    <>
                      <span className="font-medium [overflow-wrap:anywhere]">{managerName(entry.line.managerId)}</span>
                      <span>
                        Added <CoupleNameLink coupleId={entry.line.coupleId} from={historyFrom} {...parts(entry.line.coupleId)} />
                        {entry.line.dropCoupleId ? (
                          <>
                            , dropped <CoupleNameLink coupleId={entry.line.dropCoupleId} from={historyFrom} {...parts(entry.line.dropCoupleId)} />
                          </>
                        ) : (
                          " in an open spot"
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        After {formatEpisodeCasual(entry.line.weekNumber)}
                        {entry.line.startWeek != null ? ` · starts ${formatEpisodeCasual(entry.line.startWeek)}` : ""}
                      </span>
                    </>
                  )
                )}
              </div>
            ))}
        </div>
      </FoldCard>

      <FoldCard title="How Recast Works">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
          {RECAST_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </FoldCard>
    </>
  );
}
