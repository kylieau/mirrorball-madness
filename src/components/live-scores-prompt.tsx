"use client";

// Offered once per week, on a Spoiler-Free viewer's first look at Home after
// scores start posting. Staying updated and marking the week watched are the
// same operation (the mark is a high-water week, so it also covers earlier
// unmarked weeks); the difference is framing. Dismissing stays blind and is
// remembered per week on this device, and the strip's Mark Watched button is
// the way back.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { markEpisodesWatchedThrough, markWatchedAndUnlockDrafts } from "@/app/this-week/actions";
import { formatEpisodeCasual } from "@/lib/format-week";
import { usePersistedState } from "@/lib/use-persisted-state";

const LIVE_SCORES_NOTE =
  "Site Admin has posted the first dance\u2019s scores and will keep posting as they watch (live West or delayed). Follow along live or mark the episode finished to see scores and standings now. Either choice also marks previous weeks as watched.";

export function LiveScoresPrompt({
  weekNumber,
}: {
  weekNumber: number;
  earlierWeeks: number[];
}) {
  const router = useRouter();
  const [dismissed, setDismissed, hydrated] = usePersistedState(`sf-live-prompt-dismissed-week-${weekNumber}`, false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekLabel = formatEpisodeCasual(weekNumber);

  // Stay Updated follows scores as they are posted. Mark Watched means the
  // East broadcast is finished, which is what unlocks a released score draft.
  async function handleChoice(unlockDrafts: boolean) {
    setError(null);
    setPending(true);
    const result = unlockDrafts
      ? await markWatchedAndUnlockDrafts(weekNumber)
      : await markEpisodesWatchedThrough(weekNumber);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <Sheet open={hydrated && !dismissed} onOpenChange={(next) => !next && setDismissed(true)}>
      <SheetContent side="bottom" className="items-center rounded-t-3xl px-5 pb-8 text-center">
        <SheetHeader className="items-center">
          <SheetTitle className="font-heading text-xl font-semibold">Scores Have Started Posting</SheetTitle>
          <div className="text-center">
            <SheetDescription className="inline text-pretty">
              {weekLabel} judges&apos; scores are going up. Follow live, catch up fully, or stay blind.
            </SheetDescription>{" "}
            <Dialog>
              <DialogTrigger
                aria-label="About live scores"
                className="relative -top-1.5 ml-0.5 inline-flex size-3 align-baseline text-muted-foreground before:absolute before:-inset-2.5 before:content-['']"
              >
                <InfoIcon className="size-3" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="sr-only">About live scores</DialogTitle>
                  <DialogDescription className="text-left text-pretty text-popover-foreground">
                    {LIVE_SCORES_NOTE}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </SheetHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full" onClick={() => handleChoice(false)} disabled={pending}>
          {pending ? "Marking..." : "Stay Updated — I'm Watching Live (PT)"}
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => handleChoice(true)} disabled={pending}>
          Mark Watched — I&apos;ve Finished It (ET)
        </Button>
        <Button
          variant="ghost"
          className="w-full hover:bg-transparent dark:hover:bg-transparent"
          onClick={() => setDismissed(true)}
          disabled={pending}
        >
          Dismiss
        </Button>
      </SheetContent>
    </Sheet>
  );
}
