"use client";

// "Scores Are Going Live": the one decision sheet for live scores. It opens
// by itself for everyone (Spoiler-Free on or off) who opens the app during the
// East or West live window once that week has something posted, and every
// strip Stay Updated pill opens it too. East Stay Updated unlocks released
// drafts; West Stay Updated follows published scores only. Mark Watched
// unlocks drafts and catches up, and is grayed while the East broadcast is on
// air. Dismiss stays gated; the automatic prompt remembers it per week and
// coast on this device, and the sticky strip is the way back in.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { markEpisodesWatchedThrough, markWatchedAndUnlockDrafts } from "@/app/this-week/actions";
import { setSpoilerFreeMode } from "@/app/settings/actions";
import { formatEpisodeCasual } from "@/lib/format-week";
import { usePersistedState } from "@/lib/use-persisted-state";

// Two paragraphs, split on the blank line (whitespace-pre-line below).
const LIVE_SCORES_NOTE =
  "“Live” means Site Admin is posting: drafts during East air, published scores on the Pacific feed (live West or delayed).\n\nScores stay gated until you tap Stay Updated or Mark Watched — either one also marks earlier weeks watched.";

const CHIP = { east: "Live Now · East Coast", west: "Live Now · West Coast" } as const;

// coast is the live window the week is in right now, or null outside both
// (the ET-to-PT gap or after the night), when the sheet shows no chip.
// stayUnlocksDrafts: drafts plus published, else published only (West).
export type LiveScoresSheetProps = {
  coast: "east" | "west" | null;
  weekNumber: number;
  spoilerFreeMode: boolean;
  stayUnlocksDrafts: boolean;
};

export function LiveScoresSheet({
  coast,
  weekNumber,
  spoilerFreeMode,
  stayUnlocksDrafts,
  open,
  onOpenChange,
}: LiveScoresSheetProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoilerFree, setSpoilerFree] = useState(spoilerFreeMode);
  const [togglePending, setTogglePending] = useState(false);
  const markEnabled = coast !== "east";

  async function handleChoice(action: () => Promise<{ error: string | null }>) {
    setError(null);
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  async function handleSpoilerFree(checked: boolean) {
    setSpoilerFree(checked);
    setTogglePending(true);
    const result = await setSpoilerFreeMode(checked);
    if (result.error) {
      setSpoilerFree(!checked);
    } else {
      router.refresh();
    }
    setTogglePending(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="items-center gap-3 rounded-t-3xl px-5 text-center">
        <SheetHeader className="items-center">
          {coast && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
              {CHIP[coast]}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <SheetTitle className="font-heading text-xl font-semibold">Scores Are Going Live</SheetTitle>
            <Dialog>
              <DialogTrigger
                aria-label="About live scores"
                className="relative inline-flex size-4 text-accent before:absolute before:-inset-2.5 before:content-['']"
              >
                <InfoIcon className="size-4" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="sr-only">About live scores</DialogTitle>
                  <DialogDescription className="whitespace-pre-line text-left text-pretty text-popover-foreground">
                    {LIVE_SCORES_NOTE}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
          <SheetDescription className="text-pretty">
            {formatEpisodeCasual(weekNumber)} judges&apos; scores are going up. Follow live, catch up fully, or stay
            blind.
          </SheetDescription>
        </SheetHeader>

        <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm">
          <div>
            <p>Spoiler-Free Mode</p>
            <p className="text-xs text-muted-foreground">Hide results until you mark a week as watched</p>
          </div>
          <Switch checked={spoilerFree} onCheckedChange={handleSpoilerFree} disabled={togglePending} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex w-full flex-col gap-1">
          <Button
            size="lg"
            className="w-full"
            onClick={() =>
              handleChoice(() =>
                stayUnlocksDrafts ? markWatchedAndUnlockDrafts(weekNumber) : markEpisodesWatchedThrough(weekNumber)
              )
            }
            disabled={pending}
          >
            {pending ? "Updating..." : "Stay Updated — I'm Watching Live"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {stayUnlocksDrafts ? "Follow along as scores are entered" : "Follow along as official scores post"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => handleChoice(() => markWatchedAndUnlockDrafts(weekNumber))}
            disabled={pending || !markEnabled}
          >
            Mark Watched — I&apos;ve Finished It
          </Button>
          {markEnabled && <p className="text-xs text-muted-foreground">You&apos;re caught up · scores unlock</p>}
        </div>
        <Button
          variant="ghost"
          className="w-full hover:bg-transparent dark:hover:bg-transparent"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Dismiss
        </Button>
      </SheetContent>
    </Sheet>
  );
}

// The automatic prompt inside a live window.
export function LiveScoresPrompt({
  coast,
  weekNumber,
  spoilerFreeMode,
}: {
  coast: "east" | "west";
  weekNumber: number;
  spoilerFreeMode: boolean;
}) {
  const [dismissed, setDismissed, hydrated] = usePersistedState(
    `live-air-prompt-dismissed-week-${weekNumber}-${coast}`,
    false
  );
  return (
    <LiveScoresSheet
      coast={coast}
      weekNumber={weekNumber}
      spoilerFreeMode={spoilerFreeMode}
      stayUnlocksDrafts={coast === "east"}
      open={hydrated && !dismissed}
      onOpenChange={(next) => !next && setDismissed(true)}
    />
  );
}

// A strip's Stay Updated pill: opens the same sheet on demand.
export function LiveScoresPill({ className, ...sheet }: LiveScoresSheetProps & { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" className={className} onClick={() => setOpen(true)}>
        Stay Updated
      </Button>
      <LiveScoresSheet {...sheet} open={open} onOpenChange={setOpen} />
    </>
  );
}
