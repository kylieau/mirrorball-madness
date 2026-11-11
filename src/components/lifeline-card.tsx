"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleDashedIcon } from "lucide-react";
import { saveLifelinePicks } from "@/app/leagues/[id]/lifeline/actions";
import { CoupleNameLink, coupleNameNode } from "@/components/couple-name";
import { FoldCard } from "@/components/fold-card";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasual } from "@/lib/format-week";
import { LIFELINE_RULES } from "@/lib/lifeline-picks";

export type LifelineCardSlot = { slotNumber: number; formerCoupleId: string; pickCoupleId: string | null };
export type LifelineLeagueEntry = { managerId: string; displayName: string; coupleIds: string[] };

const CHOOSE_COUPLE = "Choose a couple…";
const UNKNOWN_COUPLE: CoupleNameParts = { celebrity: "Unknown", pro: "Unknown" };

export function LifelineCatchUpCard({ pendingRevealWeek }: { pendingRevealWeek: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Catch Up to Play a Lifeline</CardTitle>
        <CardDescription>
          Mark the latest week as watched to see whether you have a Lifeline to play. We won&apos;t name anyone until
          then.
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

// The viewer's own Lifeline first (one block per open spot), then the
// league's picks and the rules folded away under it.
export function LifelineCard({
  leagueId,
  week,
  isLocked,
  slots,
  couples,
  coupleDisplayNames,
  leagueEntries,
  historyFrom,
}: {
  leagueId: string;
  week: { id: string; weekNumber: number; isFinale: boolean };
  isLocked: boolean;
  // The viewer's dead roster spots this week; empty when they have none and
  // the page only carries the league's picks.
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

  const parts = (coupleId: string) => coupleDisplayNames[coupleId] ?? UNKNOWN_COUPLE;
  const several = slots.length > 1;
  const weekLabel = formatEpisodeCasual(week.weekNumber);

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
    // Saving with every spot still empty is not a saved Lifeline.
    if (slots.some((slot) => picks[slot.slotNumber])) setEditing(false);
  }

  function cancel() {
    setPicks(savedBySlot);
    setError(null);
    setEditing(false);
  }

  const pickLine = (slot: LifelineCardSlot, value: ReactNode) => (
    <div key={slot.slotNumber} className="flex items-start justify-between gap-3">
      <span className="min-w-0 text-muted-foreground">In place of {coupleNameNode(parts(slot.formerCoupleId))}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Your {weekLabel} {several ? "Lifelines" : "Lifeline"}
          </CardTitle>
          <CardDescription>
            {slots.length === 0
              ? "You have no open spot this week."
              : `A stand-in for ${several ? "each roster spot" : "a roster spot"} whose couple went home. You earn half their Dance Card points ${
                  week.isFinale ? "in the Finale" : "this week, even if they go home"
                }. Pick again each week.`}
          </CardDescription>
        </CardHeader>
        {slots.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {error && (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            )}

            {!isLocked && editing && (
              <>
                {slots.map((slot) => {
                  const id = `lifeline-${slot.slotNumber}`;
                  const items: Record<string, ReactNode> = {
                    "": CHOOSE_COUPLE,
                    ...Object.fromEntries(couples.map((couple) => [couple.id, coupleNameNode(parts(couple.id))])),
                  };
                  return (
                    <div key={slot.slotNumber} className="flex flex-col gap-2">
                      <Label htmlFor={id} className="leading-snug">
                        <span>In Place of {coupleNameNode(parts(slot.formerCoupleId))}</span>
                      </Label>
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
                      {!picks[slot.slotNumber] && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                          <CircleDashedIcon aria-hidden className="size-3.5" />
                          No pick yet
                        </span>
                      )}
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

            {!isLocked && !editing && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-text">
                    <span
                      aria-hidden
                      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/30 text-[10px]"
                    >
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

            {isLocked && (
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
          </CardContent>
        )}
      </Card>

      <FoldCard
        title="League Lifelines"
        note={isLocked ? (leagueEntries.length === 0 ? "None this week" : undefined) : `Shown once ${weekLabel} locks`}
      >
        {isLocked && leagueEntries.length > 0 ? (
          <ul className="flex flex-col [&_a]:no-underline [&_a]:hover:text-accent">
            {leagueEntries.map((entry) => (
              <li
                key={entry.managerId}
                className="flex items-start justify-between gap-3 border-b border-border py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
              >
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{entry.displayName}</span>
                <span className="flex min-w-0 flex-col items-end text-right">
                  {entry.coupleIds.map((coupleId) => (
                    <CoupleNameLink key={coupleId} coupleId={coupleId} from={historyFrom} {...parts(coupleId)} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLocked ? "Nobody in the league played a Lifeline this week." : "Everyone's Lifelines are private until the week locks."}
          </p>
        )}
      </FoldCard>

      <FoldCard title="How Lifeline Works">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
          {LIFELINE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </FoldCard>
    </>
  );
}
