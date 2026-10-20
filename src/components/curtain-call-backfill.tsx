"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { backfillCurtainCallPick } from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type CurtainCallBackfillInput = {
  managers: { userId: string; displayName: string }[];
  weeks: { id: string; label: string; isDouble: boolean }[];
  defaultWeekId: string | null;
  couples: { id: string; name: string }[];
  picks: {
    managerId: string;
    weekId: string;
    eliminated: string | null;
    eliminated2: string | null;
    topScorer: string | null;
    backfilled: boolean;
  }[];
};

const NONE = "none";

function CoupleSelect({
  id,
  label,
  value,
  onChange,
  items,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => onChange((v as string) ?? NONE)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([coupleId, name]) => (
            <SelectItem key={coupleId} value={coupleId}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Site admins only: records a pick a manager made in time but couldn't save
// (a text before the lock). The RPC refuses anyone else and stores who
// entered it, when the pick was really made and why.
export function CurtainCallBackfill({
  leagueId,
  managers,
  weeks,
  defaultWeekId,
  couples,
  picks,
}: CurtainCallBackfillInput & { leagueId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [managerId, setManagerId] = useState(managers[0]?.userId ?? "");
  const [weekId, setWeekId] = useState(defaultWeekId ?? weeks[0]?.id ?? "");
  const [eliminated, setEliminated] = useState(NONE);
  const [eliminated2, setEliminated2] = useState(NONE);
  const [topScorer, setTopScorer] = useState(NONE);
  const [madeAt, setMadeAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const coupleName = new Map(couples.map((c) => [c.id, c.name]));
  const coupleItems: Record<string, string> = { [NONE]: "No pick", ...Object.fromEntries(coupleName) };
  const week = weeks.find((w) => w.id === weekId);
  const current = picks.find((p) => p.managerId === managerId && p.weekId === weekId);
  const currentText = current
    ? [
        current.eliminated && `Eliminated ${coupleName.get(current.eliminated) ?? "?"}`,
        current.eliminated2 && `and ${coupleName.get(current.eliminated2) ?? "?"}`,
        current.topScorer && `Top Scorer ${coupleName.get(current.topScorer) ?? "?"}`,
      ]
        .filter(Boolean)
        .join(" · ") + (current.backfilled ? " (recorded by an admin)" : "")
    : "No pick saved for this week.";

  function openSheet() {
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    if (!madeAt) {
      setError("Enter when the manager made this pick.");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await backfillCurtainCallPick(leagueId, {
      managerId,
      weekId,
      eliminated: eliminated === NONE ? null : eliminated,
      eliminated2: week?.isDouble && eliminated2 !== NONE ? eliminated2 : null,
      topScorer: topScorer === NONE ? null : topScorer,
      pickMadeAt: new Date(madeAt).toISOString(),
      reason,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setEliminated(NONE);
    setEliminated2(NONE);
    setTopScorer(NONE);
    setMadeAt("");
    setReason("");
    router.refresh();
  }

  if (managers.length === 0 || weeks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Site Admin</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Enter a pick a manager made in time but couldn&apos;t save.</p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={openSheet}>
          Record a Pick
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-3 overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">Record a Curtain Call Pick</SheetTitle>
            <SheetDescription>
              For a pick made before the lock but never saved, like a text. It&apos;s saved with your name, when the
              pick was made and why. A week that&apos;s already published updates its points the next time it&apos;s
              published.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="backfillManager">Manager</Label>
              <Select
                items={Object.fromEntries(managers.map((m) => [m.userId, m.displayName]))}
                value={managerId}
                onValueChange={(v) => setManagerId((v as string) ?? managerId)}
              >
                <SelectTrigger id="backfillManager" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="backfillWeek">Week</Label>
              <Select
                items={Object.fromEntries(weeks.map((w) => [w.id, w.label]))}
                value={weekId}
                onValueChange={(v) => setWeekId((v as string) ?? weekId)}
              >
                <SelectTrigger id="backfillWeek" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Current pick: {currentText}</p>
            </div>
            <CoupleSelect
              id="backfillEliminated"
              label="Eliminated"
              value={eliminated}
              onChange={setEliminated}
              items={coupleItems}
            />
            {week?.isDouble && (
              <CoupleSelect
                id="backfillEliminated2"
                label="Second Eliminated"
                value={eliminated2}
                onChange={setEliminated2}
                items={coupleItems}
              />
            )}
            <CoupleSelect
              id="backfillTopScorer"
              label="Top Scorer"
              value={topScorer}
              onChange={setTopScorer}
              items={coupleItems}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="backfillMadeAt">Pick Made At</Label>
              <Input
                id="backfillMadeAt"
                type="datetime-local"
                value={madeAt}
                onChange={(e) => setMadeAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">When the manager actually made the pick, in your time zone.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="backfillReason">Reason</Label>
              <Input
                id="backfillReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Texted me their picks at 7:40pm"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Pick"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
