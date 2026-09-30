"use client";

// Stay Updated unlocks scores that can't be un-seen, from a small pill that's
// easy to mis-tap, so every Stay Updated (strip pills and the live-air prompt)
// confirms in this one light sheet first. Not now leaves everything gated.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { markEpisodesWatchedThrough, markWatchedAndUnlockDrafts } from "@/app/this-week/actions";

// unlockDrafts: drafts plus published (unlock_draft_scores_through), else
// published only (mark_episodes_watched_through), as for West Stay Updated.
export async function stayUpdated(weekNumber: number, unlockDrafts: boolean) {
  return unlockDrafts ? markWatchedAndUnlockDrafts(weekNumber) : markEpisodesWatchedThrough(weekNumber);
}

// The sheet's contents, also rendered in place inside the live-air prompt so
// the confirm never stacks a second sheet on top of it.
export function StayUpdatedConfirmBody({
  onConfirm,
  onCancel,
  pending,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <>
      <SheetHeader className="items-center">
        <SheetTitle className="font-heading text-xl font-semibold">Unlock draft scores?</SheetTitle>
        <SheetDescription className="text-pretty">
          You&apos;ll see scores as they&apos;re entered this week. To hide them again: turn Spoiler-Free on and
          rewind to this week.
        </SheetDescription>
      </SheetHeader>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" className="w-full" onClick={onConfirm} disabled={pending}>
        {pending ? "Updating..." : "Stay Updated"}
      </Button>
      <Button
        variant="ghost"
        className="w-full hover:bg-transparent dark:hover:bg-transparent"
        onClick={onCancel}
        disabled={pending}
      >
        Not now
      </Button>
    </>
  );
}

export function StayUpdatedPill({
  weekNumber,
  unlockDrafts,
  className,
}: {
  weekNumber: number;
  unlockDrafts: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const result = await stayUpdated(weekNumber, unlockDrafts);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="xs" className={className} onClick={() => setOpen(true)}>
        Stay Updated
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="items-center rounded-t-3xl px-5 pb-8 text-center">
          <StayUpdatedConfirmBody
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            pending={pending}
            error={error}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
