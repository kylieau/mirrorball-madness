"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { unlockGrandFinaleLate } from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LATE_OUTCOMES_OPT_IN,
  LATE_OUTCOMES_WARNING_TITLE,
  allowLateButtonLabel,
  latePercent,
  lateScoreHistoryHelper,
  lateUnlockWarning,
  managerInitials,
  parseLatePercent,
} from "@/lib/grand-finale-late";

export type LateMisser = {
  userId: string;
  displayName: string;
  lateUnlock: { lateFactor: number; submitted: boolean } | null;
};

export type GrandFinaleLateUnlockInput = {
  grandFinaleLocked: boolean;
  memberCount: number;
  lockedCount: number;
  canUnlock: boolean;
  resolvedCount: number;
  missers: LateMisser[];
};

function misserStatus(misser: LateMisser): string {
  if (!misser.lateUnlock) return "No bracket submitted";
  if (misser.lateUnlock.submitted) return "Late entry used";
  return `Late entry open · ${latePercent(misser.lateUnlock.lateFactor)}%`;
}

export function GrandFinaleLateUnlock({
  leagueId,
  grandFinaleLocked,
  memberCount,
  lockedCount,
  canUnlock,
  resolvedCount,
  missers,
}: GrandFinaleLateUnlockInput & { leagueId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [misser, setMisser] = useState<LateMisser | null>(null);
  const [percent, setPercent] = useState(100);
  const [percentText, setPercentText] = useState("100");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!grandFinaleLocked) return null;

  const showMissed = canUnlock && missers.length > 0;
  const warning = lateUnlockWarning(resolvedCount);
  const parsed = parseLatePercent(percentText);
  const helper = lateScoreHistoryHelper(parsed ?? percent);
  const canConfirm = parsed !== null && (!warning || acknowledged) && !submitting;

  function setFromNumber(next: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    setPercent(clamped);
    setPercentText(String(clamped));
  }

  function onTextChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      setPercentText("");
      return;
    }
    const value = Number(digits);
    if (value > 100) {
      setFromNumber(100);
      return;
    }
    setPercent(value);
    setPercentText(digits);
  }

  function openFor(next: LateMisser) {
    setMisser(next);
    setPercent(100);
    setPercentText("100");
    setAcknowledged(false);
    setError(null);
    setOpen(true);
  }

  async function handleUnlock() {
    if (!misser || parsed === null) return;
    setError(null);
    setSubmitting(true);
    const result = await unlockGrandFinaleLate(leagueId, misser.userId, String(parsed), acknowledged);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-y border-border py-2.5 text-xs">
        <span>Deadline passed</span>
        <span className="size-[3px] rounded-full bg-muted-foreground" />
        <span>
          {lockedCount} of {memberCount} locked
        </span>
        <span className="ml-auto text-[10px] font-bold tracking-wider text-accent uppercase">Locked</span>
      </div>
      {showMissed && (
        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Missed the lock</p>
          <div className="flex flex-col gap-2">
            {missers.map((row) => (
              <div
                key={row.userId}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-2.5 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/25 text-xs font-bold">
                  {managerInitials(row.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.displayName}</span>
                  <span className="block text-[11px] text-muted-foreground">{misserStatus(row)}</span>
                </span>
                {!row.lateUnlock && (
                  <Button size="sm" className="rounded-full px-3" onClick={() => openFor(row)}>
                    Allow late…
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Commissioner / super-admin only · one-shot late entry</p>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-3 overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">Allow late entry</SheetTitle>
            <SheetDescription className="sr-only">
              Choose how much of a full Grand Finale score this one-shot late entry earns.
            </SheetDescription>
          </SheetHeader>
          {misser && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-2.5 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/25 text-xs font-bold">
                {managerInitials(misser.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{misser.displayName}</span>
                <span className="block text-[11px] text-muted-foreground">Missed GF lock · no bracket</span>
              </span>
              <span className="shrink-0 rounded-full border border-primary/40 px-2 py-1 text-[10px] font-bold tracking-wide text-accent uppercase">
                One-shot
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">Weight as % of Grand Finale</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                How much of a full GF score this late entry earns · free 0–100%
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                aria-label="Percent of Grand Finale"
                onChange={(event) => setFromNumber(Number(event.target.value))}
                className="h-2 w-full accent-primary"
              />
              <label className="flex h-11 w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-primary/50 px-2">
                <input
                  inputMode="numeric"
                  aria-label="Weight percent"
                  value={percentText}
                  onChange={(event) => onTextChange(event.target.value)}
                  onBlur={() => {
                    if (parseLatePercent(percentText) === null) setPercentText(String(percent));
                  }}
                  className="w-8 bg-transparent text-right text-base font-semibold text-accent outline-none"
                />
                <span className="text-sm font-semibold text-accent">%</span>
              </label>
            </div>
            <div className="flex justify-between pr-[5.25rem] text-[11px] text-muted-foreground">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-3 text-center">
            <p className="text-[11px] font-bold tracking-wide text-accent uppercase">Score History</p>
            <p className="mt-1 text-sm">
              Scores as <span className="font-semibold text-accent">{helper.percentLabel}</span> {helper.detail}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{helper.history}</p>
          </div>
          {warning && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                <TriangleAlertIcon className="size-4" />
                {LATE_OUTCOMES_WARNING_TITLE}
              </p>
              <p className="mt-1 text-sm text-pretty">{warning}</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>{LATE_OUTCOMES_OPT_IN}</span>
              </label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="h-11 w-full text-base font-semibold" onClick={handleUnlock} disabled={!canConfirm}>
            {submitting ? "Allowing…" : parsed !== null ? allowLateButtonLabel(parsed) : "Allow late entry"}
          </Button>
          <Button
            variant="ghost"
            className="w-full hover:bg-transparent dark:hover:bg-transparent"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
