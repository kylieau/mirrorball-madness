"use client";

// One Spoiler-Free status line for Home, shown only while there is a week to
// unlock (caught-up viewers see nothing). Pattern B: it sits in HomeSpoilerChrome
// directly under the sticky wordmark + avatar, and that stack stays stuck on
// scroll. Soft inset (docs/design/spoiler-free-strip-styles): tinted mauve fill,
// a single hairline under the stack, gold status dot, gold Mark Watched pill.
// Marking a week watched is always confirmed in a bottom sheet. "Mark Week N
// Watched" advances last_watched_week, then lands on This Week for a finished
// week so the newly revealed episode is the one on screen; a week still being
// posted stays on the page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TopBar } from "@/components/top-bar";
import { markEpisodesWatchedThrough } from "@/app/this-week/actions";
import { formatEpisodeCasual } from "@/lib/format-week";
import type { AccountSettingsData } from "@/lib/account-settings-data";

// weekNumber is the latest week that can be unlocked; earlierWeeks are the
// unmarked weeks before it, which marking a later week unlocks too.
export type SpoilerFreeStripState =
  | { kind: "ready" | "posting"; weekNumber: number; earlierWeeks: number[] }
  | { kind: "watching"; weekNumber: number };

type MarkableState = Extract<SpoilerFreeStripState, { earlierWeeks: number[] }>;

// Full-bleed row. Stickiness belongs to HomeSpoilerChrome so the wordmark and
// this line move as one stack; a hairline under the mauve is the stack's only edge.
const STRIP_CLASSES =
  "flex min-h-[34px] items-center gap-1.5 border-b border-foreground/15 bg-[#1e1420] bg-[image:linear-gradient(180deg,rgba(52,34,50,0.92),rgba(36,24,40,0.88))] px-4 py-1.5";

const DOT_CLASSES = "size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_rgba(201,162,75,0.22)]";

const PILL_CLASSES = "h-6 shrink-0 rounded-full px-2.5 text-[11px] font-bold";

// Sticky wordmark + avatar, then the strip. The Home title stays in page flow
// and scrolls away underneath. Rendered only while there is a week to unlock.
export function HomeSpoilerChrome({
  state,
  email,
  ...accountSettingsData
}: AccountSettingsData & { email: string; state: SpoilerFreeStripState }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-background pt-[env(safe-area-inset-top)]">
      <div className="px-4 py-2">
        <TopBar {...accountSettingsData} email={email} />
      </div>
      <SpoilerFreeStrip state={state} />
    </div>
  );
}

export function SpoilerFreeStrip({ state }: { state: SpoilerFreeStripState }) {
  if (state.kind === "watching") {
    return (
      <div className={STRIP_CLASSES}>
        <span className={cn(DOT_CLASSES, "animate-pulse")} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
          <span className="font-semibold text-accent">Watching live</span> · {formatEpisodeCasual(state.weekNumber)}
        </p>
      </div>
    );
  }
  return <MarkWatchedStrip state={state} />;
}

function MarkWatchedStrip({ state }: { state: MarkableState }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekLabel = formatEpisodeCasual(state.weekNumber);
  const choices = [...state.earlierWeeks, state.weekNumber];
  const [through, setThrough] = useState(state.weekNumber);
  const [picking, setPicking] = useState(false);
  const throughLabel = formatEpisodeCasual(through);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setThrough(state.weekNumber);
      setPicking(false);
    }
  }

  async function handleMark() {
    setError(null);
    setPending(true);
    const result = await markEpisodesWatchedThrough(through);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    if (state.kind === "ready" && through === state.weekNumber) router.push("/this-week");
    router.refresh();
  }

  const message = state.kind === "ready" ? `${weekLabel} results are in` : `${weekLabel} posting live`;

  return (
    <>
      <div className={STRIP_CLASSES}>
        <span className={cn(DOT_CLASSES, state.kind === "posting" && "animate-pulse")} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
          <span className="font-semibold text-accent">Spoiler-Free</span> · {message}
        </p>
        <Button size="xs" className={PILL_CLASSES} onClick={() => handleOpenChange(true)}>
          Mark Watched
        </Button>
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="items-center rounded-t-3xl px-5 pb-8 text-center">
          <SheetHeader className="items-center">
            <SheetTitle className="font-heading text-xl font-semibold">Mark {throughLabel} Watched?</SheetTitle>
            <SheetDescription className="text-pretty">
              {state.kind === "posting" && through === state.weekNumber
                ? "You'll see scores already posted, plus anything else posted tonight, including who goes home."
                : "Scores, dances, and eliminations will show through this week."}
            </SheetDescription>
          </SheetHeader>
          {picking && (
            <div className="flex w-full flex-col gap-2 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                I&apos;ve Watched Through
              </p>
              <div role="radiogroup" aria-label="Watched through" className="overflow-hidden rounded-xl border border-border">
                {choices.map((week) => (
                  <button
                    key={week}
                    type="button"
                    role="radio"
                    aria-checked={week === through}
                    onClick={() => setThrough(week)}
                    disabled={pending}
                    className={cn(
                      "flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left text-sm font-semibold first:border-t-0",
                      week === through && "bg-primary/10 text-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border-2",
                        week === through ? "border-primary" : "border-muted-foreground/50"
                      )}
                    >
                      {week === through && <span className="size-2.5 rounded-full bg-primary" />}
                    </span>
                    {formatEpisodeCasual(week)}
                    {week === state.weekNumber && (
                      <span className="ml-auto text-xs font-medium text-primary/80">Latest</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" className="w-full" onClick={handleMark} disabled={pending}>
            {pending ? "Marking..." : picking ? `Mark Through ${throughLabel}` : `Mark ${throughLabel} Watched`}
          </Button>
          {choices.length > 1 && !picking && (
            <Button variant="ghost" className="w-full text-primary hover:bg-transparent hover:text-primary dark:hover:bg-transparent" onClick={() => setPicking(true)} disabled={pending}>
              Choose an Earlier Week ›
            </Button>
          )}
          <Button variant="ghost" className="w-full hover:bg-transparent dark:hover:bg-transparent" onClick={() => handleOpenChange(false)} disabled={pending}>
            Not Yet
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
