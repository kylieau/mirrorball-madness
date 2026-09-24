"use client";

import { useState, type ReactNode } from "react";
import { ChevronRightIcon, ChevronUpIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";

// One hop shared by the Dance Card, Curtain Call and Grand Finale peer lists
// on Picks: collapsed it's a single row under the card's own content; open,
// the peer list grows inside the same bordered container so the whole thing
// reads as one expanding unit on the same scroll. Callers only render it
// when there are peers to show (Curtain Call / Grand Finale: after lock).
export function LeagueGlanceHop({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("mt-2 overflow-hidden rounded-2xl border", open ? "border-primary/50" : "border-primary/30")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 px-3.5 py-3 text-left",
          open && "border-b border-primary/40 bg-primary/10"
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-accent">
          <UsersIcon className="size-4" />
        </span>
        <span className="flex-1 text-sm font-semibold">League at a Glance</span>
        {open ? (
          <ChevronUpIcon className="size-4 shrink-0 text-accent" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-accent" />
        )}
      </button>
      {open && <div className="px-3.5 pb-1 pt-1">{children}</div>}
    </div>
  );
}
