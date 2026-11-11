"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { saveRecastList } from "@/app/leagues/[id]/waivers/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { RecastCatchUpCard } from "@/components/recast-catch-up-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type RecastNextRun = {
  weekNumber: number;
  dueAt: string;
  // When a run still waiting on results goes ahead without them.
  latestAt: string;
  waitingOnResults: boolean;
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

const UNKNOWN_COUPLE: CoupleNameParts = { celebrity: "Unknown", pro: "Unknown" };
const CHOOSE_COUPLE = "Choose a couple…";
const CHOOSE_SPOT = "Choose a roster spot…";

export function RecastPanel({
  leagueId,
  closeHref,
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
}: {
  leagueId: string;
  closeHref: string;
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
}) {
  const router = useRouter();
  const [addCoupleId, setAddCoupleId] = useState("");
  const [addSlot, setAddSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dueAt = useFormattedDeadline(nextRun?.dueAt);
  const latestAt = useFormattedDeadline(nextRun?.latestAt);

  const from = `/leagues/${leagueId}/waivers`;
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

  const wireItems: Record<string, ReactNode> = {
    "": CHOOSE_COUPLE,
    ...Object.fromEntries(wire.map((entry) => [entry.coupleId, name(entry.coupleId)])),
  };
  const spotItems: Record<string, ReactNode> = {
    "": CHOOSE_SPOT,
    ...Object.fromEntries(spots.map((spot) => [String(spot.slotNumber), spotLabel(spot)])),
  };
  const alreadyListed = list.some((claim) => claim.coupleId === addCoupleId && String(claim.slotNumber) === addSlot);

  async function save(next: RecastClaim[]) {
    setError(null);
    setSaving(true);
    const result = await saveRecastList(leagueId, next);
    setSaving(false);
    router.refresh();
    if (result.error) setError(result.error);
    return !result.error;
  }

  async function addClaim() {
    const spot = spotBySlot.get(Number(addSlot));
    if (!addCoupleId || !spot) return;
    const saved = await save([
      ...list,
      { coupleId: addCoupleId, slotNumber: spot.slotNumber, dropCoupleId: spot.open ? null : spot.coupleId },
    ]);
    if (saved) {
      setAddCoupleId("");
      setAddSlot("");
    }
  }

  const runLine = !nextRun
    ? "There are no more waiver runs this season."
    : nextRun.waitingOnResults
      ? `Waiting on ${formatEpisodeCasual(nextRun.weekNumber)} results. The run goes ahead once they're posted${latestAt ? `, or ${latestAt} either way` : ""}.`
      : dueAt
        ? `Next waiver run: ${dueAt}.`
        : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-12">
      <Link href={closeHref} aria-label="Close" className="self-start text-muted-foreground hover:text-foreground">
        <XIcon className="size-5" />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recast</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mirrorball&apos;s waiver wire.</p>
        {runLine && <p className="mt-1 text-sm text-muted-foreground">{runLine}</p>}
        {nextRun?.startWeek != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            A claim that wins starts scoring for you in {formatEpisodeCasual(nextRun.startWeek)}.
          </p>
        )}
      </div>

      {behind && <RecastCatchUpCard pendingRevealWeek={pendingRevealWeek} />}

      {!behind && nextRun && (
        <Card>
          <CardHeader>
            <CardTitle>Your Waiver List</CardTitle>
            <CardDescription>
              Ranked, and private until the run. Your turn takes the highest claim that can still win; a drop only
              happens if its claim does.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error && (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            )}
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No claims yet.</p>
            ) : (
              <ol className="flex flex-col">
                {list.map((claim, index) => {
                  const spot = spotBySlot.get(claim.slotNumber);
                  return (
                    <li
                      key={`${claim.coupleId}:${claim.slotNumber}`}
                      className="flex items-center gap-3 border-b border-border py-2.5 text-sm last:border-b-0"
                    >
                      <span className="w-5 shrink-0 font-rank text-base text-muted-foreground">{index + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">Add {name(claim.coupleId)}</span>
                        <span className="text-muted-foreground">
                          {claim.dropCoupleId ? (
                            <>Drop {name(claim.dropCoupleId)}</>
                          ) : spot?.coupleId ? (
                            <>Open spot (was {name(spot.coupleId)})</>
                          ) : (
                            "Open spot"
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

            {wire.length === 0 ? (
              <p className="text-sm text-muted-foreground">No couple is on the wire right now.</p>
            ) : (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="recast-add">Add</Label>
                  <Select items={wireItems} value={addCoupleId} onValueChange={(v) => setAddCoupleId(v ?? "")}>
                    <SelectTrigger id="recast-add" className="w-full">
                      <SelectValue placeholder={CHOOSE_COUPLE} />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {wire.map((entry) => (
                        <SelectItem key={entry.coupleId} value={entry.coupleId}>
                          {name(entry.coupleId)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="recast-spot">In Place Of</Label>
                  <Select items={spotItems} value={addSlot} onValueChange={(v) => setAddSlot(v ?? "")}>
                    <SelectTrigger id="recast-spot" className="w-full">
                      <SelectValue placeholder={CHOOSE_SPOT} />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {spots.map((spot) => (
                        <SelectItem key={spot.slotNumber} value={String(spot.slotNumber)}>
                          {spotLabel(spot)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="self-start"
                  disabled={saving || !addCoupleId || !addSlot || alreadyListed}
                  onClick={() => void addClaim()}
                >
                  {saving ? "Saving…" : alreadyListed ? "Already on Your List" : "Add to List"}
                </Button>
              </div>
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
              {wire.length === 1 ? "1 couple you can claim." : `${wire.length} couples you can claim.`}
            </CardDescription>
          </CardHeader>
          {wire.length > 0 && (
            <CardContent className="flex flex-col gap-1.5 text-sm [&_a]:no-underline [&_a]:hover:text-accent">
              {wire.map((entry) => (
                <div key={entry.coupleId} className="flex items-start justify-between gap-3">
                  <CoupleNameLink coupleId={entry.coupleId} from={from} {...parts(entry.coupleId)} />
                  {entry.droppedBy && (
                    <span className="text-right text-xs text-muted-foreground">
                      Pending drop · {managerName(entry.droppedBy)}
                      <br />
                      Only if their claim wins
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {order.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Waiver Order</CardTitle>
            <CardDescription>
              Reverse standings{orderThroughWeek != null ? ` through ${formatEpisodeCasual(orderThroughWeek)}` : ""}:
              lowest season total first, then the lower latest week, then the later draft pick. It is set when the run
              starts and says nothing about who gets whom.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {order.map((entry, index) => (
                <li
                  key={entry.managerId}
                  className="flex items-center gap-3 border-b border-border py-2 text-sm last:border-b-0"
                >
                  <span className="w-5 shrink-0 font-rank text-base text-muted-foreground">{index + 1}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{managerName(entry.managerId)}</span>
                    {entry.managerId === teamId && <YouPill />}
                  </span>
                  <span className="shrink-0 font-heading">{formatPoints(entry.seasonTotal)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Adds and Drops</CardTitle>
          <CardDescription>Every claim awarded in this league.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col text-sm [&_a]:no-underline [&_a]:hover:text-accent">
          {log.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
          {log.map((line) => (
            <div key={line.id} className="flex flex-col border-b border-border py-2.5 last:border-b-0">
              <span className="font-medium [overflow-wrap:anywhere]">{managerName(line.managerId)}</span>
              <span>
                Added <CoupleNameLink coupleId={line.coupleId} from={from} {...parts(line.coupleId)} />
                {line.dropCoupleId ? (
                  <>
                    , dropped{" "}
                    <CoupleNameLink coupleId={line.dropCoupleId} from={from} {...parts(line.dropCoupleId)} />
                  </>
                ) : (
                  " in an open spot"
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                After {formatEpisodeCasual(line.weekNumber)}
                {line.startWeek != null ? ` · starts ${formatEpisodeCasual(line.startWeek)}` : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Recast Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
            {RECAST_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
