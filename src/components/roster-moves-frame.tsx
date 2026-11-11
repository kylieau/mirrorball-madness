"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { RosterMovesSwitch } from "@/components/roster-moves-switch";
import type { RosterMoveTab, RosterMoveTabKey } from "@/lib/league-triage";
import { rosterMoveTabHref } from "@/lib/roster-moves-pages";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

// A fact is a time, formatted on the client like every other deadline, or a
// plain value.
export type RosterMovesFact = { label: string; at: string | null; value?: string };

// The frame the Lifeline, Recast and Trades pages share: a back link that
// says where it goes, the Transactions title, the same switch as the Picks
// card (on this page's tab), and the two facts that matter as a strip. The
// page's own to-do comes first under it; reference folds away at the bottom.
export function RosterMovesFrame({
  leagueId,
  back,
  tabs,
  selected,
  from,
  facts,
  children,
}: {
  leagueId: string;
  back: { href: string; label: string };
  tabs: RosterMoveTab[];
  selected: RosterMoveTabKey;
  from: string;
  facts: RosterMovesFact[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-12">
      <Link
        href={back.href}
        className="flex items-center gap-0.5 self-start text-sm text-muted-foreground no-underline hover:text-foreground"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        {back.label}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      {tabs.length > 1 && (
        <RosterMovesSwitch tabs={tabs} selected={selected} hrefFor={(key) => rosterMoveTabHref(leagueId, key, from)} />
      )}
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {facts.map((fact) => (
            <Fact key={fact.label} {...fact} />
          ))}
        </dl>
      )}
      {children}
    </div>
  );
}

function Fact({ label, at, value }: RosterMovesFact) {
  const formatted = useFormattedDeadline(at);
  const shown = at ? formatted : value;
  return (
    <div className="rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
      <dt className="text-[11px] tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm font-semibold">{shown || " "}</dd>
    </div>
  );
}
