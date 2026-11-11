"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { LeagueStatusPill } from "@/components/league-status-pill";
import { cn } from "cn";
import type { LeagueTab } from "@/components/league-header";
import { getSwitcherSummaries, type SwitcherSummary } from "@/app/leagues/[id]/switcher/actions";

export type SwitcherLeague = { id: string; name: string };

// Lives on the pinned title row, right of the title (Picks / Standings
// only — the caller decides whether to render this at all). Nothing to
// switch to with just one league, so it renders nothing rather than a dead
// chip. It opens anchored under the trigger, pinned or not, rather than
// from the top of the screen (Kylie, 2026-11-11).
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
  const [open, setOpen] = useState(false);
  const [summaries, setSummaries] = useState<Map<string, SwitcherSummary> | null>(null);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  // Fetched once after paint so the list is usually ready when opened, then
  // again on every open: Picks Due and rank change while the page stays put.
  // The previous rows stay on screen while a refetch runs.
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

  const multipleLeagues = leagues.length > 1;
  useEffect(() => {
    if (multipleLeagues) void loadSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multipleLeagues, currentLeagueId]);

  if (!multipleLeagues) return null;

  function rankLine(leagueId: string, isCurrent: boolean) {
    const summary = isCurrent ? currentStanding : summaries?.get(leagueId);
    if (summary) return `Rank ${summary.rank} of ${summary.totalMembers}${isCurrent ? ", currently viewing" : ""}`;
    if (failed) return "League details unavailable";
    return summaries ? "" : "Loading…";
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadSummaries();
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" />}
        aria-label={`Switch league, ${current?.name ?? ""}`}
        className="group -mr-2 min-w-0 shrink gap-1.5 px-2 text-sm font-medium text-muted-foreground"
      >
        <span className="min-w-0 truncate">{current?.name}</span>
        <ChevronDownIcon
          className="size-3.5 shrink-0 text-accent transition-transform group-data-popup-open:rotate-180"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        alignOffset={8}
        className="max-h-[min(24rem,var(--available-height))] w-[min(22rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <PopoverTitle className="px-4 pb-1 pt-3 text-sm font-semibold">Your Leagues</PopoverTitle>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-0.5">
          {leagues.map((l) => {
            const isCurrent = l.id === currentLeagueId;
            const picksDue = !isCurrent && summaries?.get(l.id)?.picksDue;
            return (
              <li key={l.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/leagues/${l.id}/${tab}`}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={(event) => {
                    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) setOpen(false);
                  }}
                  className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("line-clamp-2 break-words text-sm font-semibold", isCurrent && "text-accent")}>
                      {l.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{rankLine(l.id, isCurrent)}</span>
                  </span>
                  {isCurrent ? (
                    <CheckIcon className="size-4 shrink-0 text-accent" aria-hidden />
                  ) : (
                    picksDue && <LeagueStatusPill picksDue />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border px-4 py-3">
          <CreateJoinLeagueDialogs />
        </div>
      </PopoverContent>
    </Popover>
  );
}
