"use client";

import Link from "next/link";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import { formatEpisodeLabel } from "@/lib/format-week";

export type SwitcherWeek = { id: string; weekNumber: number; theme: string | null };

// Lives in This Week's switcher slot — the cross-league analog of the
// league switcher: browse past weeks' entered results instead of just the
// latest. Nothing to switch to with only one completed week, so it renders
// nothing rather than a dead chip.
export function WeekSwitcher({
  currentEpisodeId,
  weeks,
}: {
  currentEpisodeId: string;
  weeks: SwitcherWeek[];
}) {
  const current = weeks.find((w) => w.id === currentEpisodeId);

  if (weeks.length <= 1) return null;

  return (
    <Sheet>
      <SheetTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {current ? formatEpisodeLabel(current.weekNumber) : ""}
        <ChevronDownIcon className="size-3.5 text-accent" aria-hidden />
      </SheetTrigger>
      <SheetContent side="top" showCloseButton={false} className="mx-auto max-w-md rounded-b-2xl border-x">
        <SheetHeader>
          <SheetTitle>Past weeks</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-4">
          {weeks.map((w) => {
            const isCurrent = w.id === currentEpisodeId;
            return (
              <Link
                key={w.id}
                href={`/this-week?week=${w.id}`}
                className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <p className={cn("text-sm font-semibold", isCurrent && "text-accent")}>
                  {formatEpisodeLabel(w.weekNumber)}
                  {w.theme ? ` — ${w.theme}` : ""}
                </p>
                {isCurrent && <CheckIcon className="size-4 shrink-0 text-accent" aria-hidden />}
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
