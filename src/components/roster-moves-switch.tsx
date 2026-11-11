"use client";

import Link from "next/link";
import { cn } from "cn";
import type { RosterMoveTab, RosterMoveTabKey } from "@/lib/league-triage";

const LIST = "flex h-8 w-full items-center rounded-lg bg-muted p-[3px] text-muted-foreground";
const ITEM =
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 no-underline transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring";
const ON = "border-input bg-input/30 text-foreground shadow-sm";

function NeedsYouDot() {
  return (
    <>
      <span aria-hidden className="absolute top-1 right-1.5 size-1.5 rounded-full bg-accent" />
      <span className="sr-only">, needs you</span>
    </>
  );
}

// One switch between Lifeline, Recast and Trades, the same on the Picks card
// (where it swaps the lines under it in place) and on their pages (where each
// segment is a link to that page). A gold dot marks a tab that still needs
// the viewer. Callers render it only with two or more tabs: one segment
// alone would look like a broken switch.
export function RosterMovesSwitch({
  tabs,
  selected,
  onSelect,
  hrefFor,
}: {
  tabs: RosterMoveTab[];
  selected: RosterMoveTabKey;
  onSelect?: (key: RosterMoveTabKey) => void;
  hrefFor?: (key: RosterMoveTabKey) => string;
}) {
  if (hrefFor) {
    return (
      <nav aria-label="Transactions" className={LIST}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={tab.key === selected ? "page" : undefined}
            className={cn(ITEM, tab.key === selected && ON)}
          >
            {tab.label}
            {tab.needsYou && <NeedsYouDot />}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label="Transactions" className={LIST}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === selected}
          onClick={() => onSelect?.(tab.key)}
          className={cn(ITEM, tab.key === selected && ON)}
        >
          {tab.label}
          {tab.needsYou && <NeedsYouDot />}
        </button>
      ))}
    </div>
  );
}
