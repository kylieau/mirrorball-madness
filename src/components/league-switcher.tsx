"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { LeagueStatusPill } from "@/components/league-status-pill";
import { cn } from "cn";
import type { LeagueTab } from "@/components/league-header";
import { getSwitcherSummaries, type SwitcherSummary } from "@/app/leagues/[id]/switcher/actions";

export type SwitcherLeague = { id: string; name: string };

// Lives in the switcher slot under the page title (and in the pinned slim bar) (Your Picks / Standings
// only — the caller decides whether to render this at all). Nothing to
// switch to with just one league, so it renders nothing rather than a dead
// chip.
export function LeagueSwitcher({
  currentLeagueId,
  leagues,
  currentStanding,
  tab,
}: {
  currentLeagueId: string;
  leagues: SwitcherLeague[];
  currentStanding: { rank: number; totalMembers: number };
  tab: LeagueTab;
}) {
  const current = leagues.find((l) => l.id === currentLeagueId);
  const [summaries, setSummaries] = useState<Map<string, SwitcherSummary> | null>(null);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  if (leagues.length <= 1) return null;

  // Read on every open: Picks Due and rank change while the page stays put.
  async function loadSummaries() {
    const request = ++latestRequest.current;
    setFailed(false);
    const result = await getSwitcherSummaries(currentLeagueId).catch(() => null);
    if (request !== latestRequest.current) return;
    if (!result?.summaries) {
      setFailed(true);
      return;
    }
    setSummaries(new Map(result.summaries.map((summary) => [summary.id, summary])));
  }

  return (
    <Sheet onOpenChange={(open) => open && void loadSummaries()}>
      <SheetTrigger className="flex max-w-full items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span className="truncate">{current?.name}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-accent" aria-hidden />
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} className="mx-auto max-w-md rounded-b-2xl border-x">
        <SheetHeader>
          <SheetTitle>Your Leagues</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-4">
          {leagues.map((l) => {
            const isCurrent = l.id === currentLeagueId;
            const summary = isCurrent ? { ...currentStanding, picksDue: false } : summaries?.get(l.id);
            return (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <Link href={`/leagues/${l.id}/${tab}`} className="flex-1">
                  <p className={cn("text-sm font-semibold", isCurrent && "text-accent")}>{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary ? `Rank ${summary.rank} of ${summary.totalMembers}` : failed ? "" : "Loading…"}
                    {isCurrent && ", currently viewing"}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {isCurrent ? (
                    <CheckIcon className="size-4 text-accent" aria-hidden />
                  ) : (
                    summary && <LeagueStatusPill picksDue={summary.picksDue} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-4 py-3">
          <CreateJoinLeagueDialogs />
        </div>
      </SheetContent>
    </Sheet>
  );
}
