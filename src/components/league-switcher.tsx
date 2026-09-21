"use client";

import Link from "next/link";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { cn } from "cn";

export type SwitcherLeague = {
  id: string;
  name: string;
  rank: number;
  totalMembers: number;
  picksDue: boolean;
};

// Lives beside the page title (Your Picks / Standings
// only — the caller decides whether to render this at all). Nothing to
// switch to with just one league, so it renders nothing rather than a dead
// chip.
export function LeagueSwitcher({
  currentLeagueId,
  leagues,
  activeTab,
}: {
  currentLeagueId: string;
  leagues: SwitcherLeague[];
  activeTab: string;
}) {
  const current = leagues.find((l) => l.id === currentLeagueId);

  if (leagues.length <= 1) return null;

  return (
    <Sheet>
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
            return (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <Link href={`/leagues/${l.id}?tab=${activeTab}`} className="flex-1">
                  <p className={cn("text-sm font-semibold", isCurrent && "text-accent")}>{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Rank {l.rank} of {l.totalMembers}
                    {isCurrent && ", currently viewing"}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {isCurrent ? (
                    <CheckIcon className="size-4 text-accent" aria-hidden />
                  ) : l.picksDue ? (
                    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
                      Picks Due
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      All caught up
                    </span>
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
