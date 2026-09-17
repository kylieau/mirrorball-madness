"use client";

import Link from "next/link";
import { ChevronDownIcon, CheckIcon, LockIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import { formatEpisodeCasualShort, formatEpisodeCasualWithTheme } from "@/lib/format-week";

export type SwitcherWeek = {
  id: string;
  weekNumber: number;
  theme: string | null;
  locked?: boolean;
  // Must be a string (not a callback) — this component is a Client Component
  // and Past picks is rendered from a Server Component. A function prop
  // would throw at runtime ("Functions cannot be passed directly to Client
  // Components") and take down the whole Your Picks page.
  href?: string;
};

function weekHref(week: SwitcherWeek): string {
  return week.href ?? `/this-week?week=${week.id}`;
}

// Past picks on Your Picks — the analog of the league switcher: browse past
// weeks instead of just the latest. Per-week href strings, because this is
// a Client Component rendered from a Server Component. This Week uses the
// slim episode carousel instead. Nothing to switch to with only one
// completed week, so it renders nothing rather than a dead chip.
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
        {current ? formatEpisodeCasualShort(current.weekNumber) : ""}
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
                href={weekHref(w)}
                className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
              >
                <p className={cn("text-sm font-semibold", isCurrent && "text-accent")}>
                  {formatEpisodeCasualWithTheme(w.weekNumber, w.theme)}
                </p>
                {isCurrent ? (
                  <CheckIcon className="size-4 shrink-0 text-accent" aria-hidden />
                ) : w.locked ? (
                  <LockIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Locked until marked watched" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
