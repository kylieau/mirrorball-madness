"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

export function LeagueSwitcher({
  currentLeagueId,
  leagues,
}: {
  currentLeagueId: string;
  leagues: SwitcherLeague[];
}) {
  const searchParams = useSearchParams();
  const current = leagues.find((l) => l.id === currentLeagueId);

  // The switcher sheet is only interactive on Your Picks and Standings —
  // Home and This Week show the league name as a plain label, matching the
  // mockup's split between a static "leaguelabel" and the tappable
  // "switcher" chip.
  const activeTab = searchParams.get("tab") ?? "thisweek";
  const isSwitcherTab = activeTab === "yourpicks" || activeTab === "standings";

  if (!isSwitcherTab || leagues.length <= 1) {
    return <h1 className="font-heading text-lg font-semibold">{current?.name}</h1>;
  }

  return (
    <Sheet>
      <SheetTrigger className="flex items-center gap-1.5 font-heading text-lg font-semibold">
        {current?.name}
        <ChevronDownIcon className="size-3.5 text-accent" aria-hidden />
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} className="mx-auto max-w-md rounded-b-2xl border-x">
        <SheetHeader>
          <SheetTitle>Your leagues</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-4">
          {leagues.map((l) => {
            const isCurrent = l.id === currentLeagueId;
            return (
              <Link
                key={l.id}
                href={`/leagues/${l.id}?tab=${activeTab}`}
                className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <div>
                  <p className={cn("text-sm font-semibold", isCurrent && "text-accent")}>{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Rank {l.rank} of {l.totalMembers}
                    {isCurrent && ", currently viewing"}
                  </p>
                </div>
                {isCurrent ? (
                  <CheckIcon className="size-4 shrink-0 text-accent" aria-hidden />
                ) : l.picksDue ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
                    Picks due
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    All caught up
                  </span>
                )}
              </Link>
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
