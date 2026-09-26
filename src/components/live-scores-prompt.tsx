"use client";

// Offered once per week, on a Spoiler-Free viewer's first look at Home after
// scores start posting. Staying updated and marking the week watched are the
// same operation (the mark is a high-water week, so it also covers earlier
// unmarked weeks); the difference is framing. Dismissing stays blind and is
// remembered per week on this device, and the strip's Mark Watched button is
// the way back.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { markEpisodesWatchedThrough } from "@/app/this-week/actions";
import { formatEpisodeCasual } from "@/lib/format-week";
import { usePersistedState } from "@/lib/use-persisted-state";

export function LiveScoresPrompt({ weekNumber, earlierWeeks }: { weekNumber: number; earlierWeeks: number[] }) {
  const router = useRouter();
  const [dismissed, setDismissed, hydrated] = usePersistedState(`sf-live-prompt-dismissed-week-${weekNumber}`, false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekLabel = formatEpisodeCasual(weekNumber);

  async function handleMark() {
    setError(null);
    setPending(true);
    const result = await markEpisodesWatchedThrough(weekNumber);
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
          <SheetDescription className="text-pretty">
            {weekLabel} judges&apos; scores are going up. Follow live, catch up fully, or stay blind — you can return.
            {earlierWeeks.length > 0 && " Both mark previous weeks as watched."}
          </SheetDescription>
        </SheetHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full" onClick={handleMark} disabled={pending}>
          {pending ? "Marking..." : "Stay Updated — I'm Watching Live"}
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={handleMark} disabled={pending}>
          Mark {weekLabel} Watched
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
