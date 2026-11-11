"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveLifelinePicks } from "@/app/leagues/[id]/lifeline/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { LeagueGlanceHop } from "@/components/league-glance-hop";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type LifelineCardSlot = { slotNumber: number; formerCoupleId: string; pickCoupleId: string | null };
export type LifelineLeagueEntry = { managerId: string; displayName: string; coupleIds: string[] };

const CHOOSE_COUPLE = "Choose a couple…";
const UNKNOWN_COUPLE: CoupleNameParts = { celebrity: "Unknown", pro: "Unknown" };

export function LifelineCatchUpCard({ pendingRevealWeek }: { pendingRevealWeek: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifeline</CardTitle>
        <CardDescription>
          Catch up and mark the latest week as watched to see whether you have a Lifeline to play. We won&apos;t name
          anyone until then.
        </CardDescription>
      </CardHeader>
      {pendingRevealWeek != null && (
        <CardContent>
          <MarkWeekWatchedButton weekNumber={pendingRevealWeek} />
        </CardContent>
      )}
    </Card>
  );
}

export function LifelineCard({
  leagueId,
  week,
  lockAt,
  isLocked,
  slots,
  couples,
  coupleDisplayNames,
  leagueEntries,
  historyFrom,
}: {
  leagueId: string;
  week: { id: string; weekNumber: number; isFinale: boolean };
  lockAt: string | null;
  isLocked: boolean;
  // The viewer's dead roster spots this week; empty when they have none and
  // the card only carries the league's picks.
  slots: LifelineCardSlot[];
  // Couples still dancing that the viewer doesn't hold.
  couples: { id: string }[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  // Other managers' picks, public once the week locks.
  leagueEntries: LifelineLeagueEntry[];
  historyFrom: string;
}) {
  const router = useRouter();
  const savedBySlot = Object.fromEntries(slots.map((slot) => [slot.slotNumber, slot.pickCoupleId ?? ""]));
  const [picks, setPicks] = useState<Record<number, string>>(savedBySlot);
  const [editing, setEditing] = useState(slots.every((slot) => !slot.pickCoupleId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formattedLockAt = useFormattedDeadline(lockAt);

  const parts = (coupleId: string) => coupleDisplayNames[coupleId] ?? UNKNOWN_COUPLE;
  const several = slots.length > 1;

  function choose(slotNumber: number, coupleId: string) {
    setPicks((current) => {
      const next = { ...current, [slotNumber]: coupleId };
      for (const slot of slots) {
        if (coupleId && slot.slotNumber !== slotNumber && next[slot.slotNumber] === coupleId) next[slot.slotNumber] = "";
      }
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaving(true);
    const changes = slots
      .filter((slot) => (picks[slot.slotNumber] ?? "") !== savedBySlot[slot.slotNumber])
      .map((slot) => ({ slotNumber: slot.slotNumber, coupleId: picks[slot.slotNumber] || null }));
    const result = changes.length > 0 ? await saveLifelinePicks(leagueId, week.id, changes) : { error: null };
    setSaving(false);
    // A failed save may still have changed a spot, so the page reloads either way.
    router.refresh();
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
  }

  function cancel() {
    setPicks(savedBySlot);
    setError(null);
    setEditing(false);
  }

  const pickLine = (slot: LifelineCardSlot, value: ReactNode) => (
    <div key={slot.slotNumber} className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">In place of {coupleNameNode(parts(slot.formerCoupleId))}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifeline · {formatEpisodeCasual(week.weekNumber)}</CardTitle>
        <CardDescription>
          {slots.length === 0
            ? "You have no empty roster spot this week."
            : `Pick a couple still dancing for ${several ? "each empty roster spot" : "your empty roster spot"}. You earn half their Dance Card points ${
                week.isFinale ? "in the Finale" : "this week, even if they go home"
              }.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slots.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {isLocked ? "Lifeline is locked for this week." : formattedLockAt ? `Locks ${formattedLockAt}` : null}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        {slots.length > 0 && !isLocked && editing && (
          <>
            {slots.map((slot) => {
              const id = `lifeline-${slot.slotNumber}`;
              const items: Record<string, ReactNode> = {
                "": CHOOSE_COUPLE,
                ...Object.fromEntries(couples.map((couple) => [couple.id, coupleNameNode(parts(couple.id))])),
              };
              return (
                <div key={slot.slotNumber} className="flex flex-col gap-2">
                  <Label htmlFor={id}>In Place of {coupleNameNode(parts(slot.formerCoupleId))}</Label>
                  <Select items={items} value={picks[slot.slotNumber] ?? ""} onValueChange={(v) => choose(slot.slotNumber, v ?? "")}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue placeholder={CHOOSE_COUPLE} />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectItem value="">{CHOOSE_COUPLE}</SelectItem>
                      {couples.map((couple) => (
                        <SelectItem key={couple.id} value={couple.id}>
                          {coupleNameNode(parts(couple.id))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : several ? "Save Lifelines" : "Save Lifeline"}
              </Button>
              {slots.some((slot) => slot.pickCoupleId) && (
                <Button variant="outline" onClick={cancel} disabled={saving}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}

        {slots.length > 0 && !isLocked && !editing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-emerald-text">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/30 text-[10px]">
                  ✓
                </span>
                {several ? "Lifelines saved" : "Lifeline saved"}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {several ? "Edit Lifelines" : "Edit Lifeline"}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {slots.map((slot) =>
                pickLine(slot, slot.pickCoupleId ? coupleNameNode(parts(slot.pickCoupleId)) : "No Pick")
              )}
            </div>
          </div>
        )}

        {slots.length > 0 && isLocked && (
          <div className="flex flex-col gap-1.5 text-sm [&_a]:no-underline [&_a]:hover:text-accent">
            {slots.map((slot) =>
              pickLine(
                slot,
                slot.pickCoupleId ? (
                  <CoupleNameLink coupleId={slot.pickCoupleId} from={historyFrom} {...parts(slot.pickCoupleId)} />
                ) : (
                  "No Pick"
                )
              )
            )}
          </div>
        )}

        {isLocked && leagueEntries.length > 0 && (
          <LeagueGlanceHop>
            <ul className="flex flex-col [&_a]:no-underline [&_a]:hover:text-accent">
              {leagueEntries.map((entry) => (
                <li
                  key={entry.managerId}
                  className="flex items-start justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{entry.displayName}</span>
                  <span className="flex shrink-0 flex-col items-end">
                    {entry.coupleIds.map((coupleId) => (
                      <CoupleNameLink key={coupleId} coupleId={coupleId} from={historyFrom} {...parts(coupleId)} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </LeagueGlanceHop>
        )}
      </CardContent>
    </Card>
  );
}
