"use client";

// Pending reveal used to be a DeadlineStub on Home, which disappeared into
// the ticket/league-card stack. Auto-opening a modal is the interrupt; the
// in-flow gold banner stays after dismiss so Home still has a CTA that
// isn't another stub. Both "Mark as watched" actions actually advance
// last_watched_week, then land on This Week so the newly revealed episode
// is the one on screen. "Not yet" only closes the modal.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markEpisodesWatchedThrough } from "@/app/this-week/actions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEpisodeCasual } from "@/lib/format-week";

export function SpoilerRevealCallout({ weekNumber }: { weekNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const episodeLabel = formatEpisodeCasual(weekNumber);

  async function handleMark() {
    setError(null);
    setPending(true);
    const result = await markEpisodesWatchedThrough(weekNumber);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    setOpen(false);
    router.push("/this-week");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleMark}
        disabled={pending}
        className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 text-left disabled:opacity-50"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <EyeOffIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Spoiler-Free Mode
          </span>
          <span className="mt-0.5 block font-heading text-sm font-semibold">
            {episodeLabel} results are in
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Mark as watched once you&apos;ve caught up
          </span>
        </span>
        <span className="mt-1 shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
          {pending ? "Marking..." : "Mark as watched"}
        </span>
      </button>
      {error && !open && <p className="mb-4 -mt-2 text-sm text-destructive">{error}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="bg-black/65 supports-backdrop-filter:backdrop-blur-sm"
          className="gap-0 overflow-hidden border-0 bg-linear-to-b from-curtain via-card to-card p-0 ring-2 ring-primary shadow-[0_24px_80px_rgba(201,162,75,0.32)] sm:max-w-[22rem]"
        >
          <div className="flex flex-col items-center px-5 pt-8 pb-5 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/40">
              <EyeOffIcon className="size-7" />
            </span>
            <DialogHeader className="mt-4 items-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Spoiler-Free Mode
              </p>
              <DialogTitle className="mt-2 font-heading text-xl font-semibold">
                {episodeLabel} results are in
              </DialogTitle>
              <DialogDescription className="mt-2 text-pretty">
                Scores, dances, and who went home stay hidden until you mark it
                watched.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="-mx-0 -mb-0 flex flex-col gap-2 border-primary/25 bg-black/25 sm:flex-col">
            <Button onClick={handleMark} disabled={pending} size="lg" className="w-full">
              {pending ? "Marking as watched..." : "Mark as watched"}
            </Button>
            <DialogClose render={<Button variant="ghost" className="w-full" disabled={pending} />}>
              Not yet
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
