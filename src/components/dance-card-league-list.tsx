"use client";

import { cn } from "cn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { usePersistedState } from "@/lib/use-persisted-state";

export type DanceCardLeagueEntry = {
  managerId: string;
  displayName: string;
  weekPoints: number;
  couples: (CoupleNameParts & { coupleId: string; weeklyPoints: number; tag: "safe" | "eliminated" })[];
};

// Lives inside RosterCard's own CardContent, after the viewer's own roster
// rows, for whichever week the roster carousel is currently showing — no
// separate week resolution, no carousel changes. Other managers only; the
// viewer's own roster is the rows above it.
export function DanceCardLeagueList({
  leagueId,
  weekId,
  entries,
}: {
  leagueId: string;
  weekId: string;
  entries: DanceCardLeagueEntry[];
}) {
  const [expanded, setExpanded] = usePersistedState<string[]>(`dc-league-expanded:${leagueId}:${weekId}`, []);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">League at a Glance</p>
      <Accordion multiple value={expanded} onValueChange={setExpanded}>
        {entries.map((e) => (
          <AccordionItem key={e.managerId} value={e.managerId}>
            <AccordionTrigger>
              <span className="flex flex-1 items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold">
                  {e.displayName.charAt(0).toUpperCase()}
                </span>
                <span>{e.displayName}</span>
                <span className="ml-auto pr-2 text-xs font-normal text-muted-foreground">
                  {e.weekPoints >= 0 ? "+" : ""}
                  {e.weekPoints} pts
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-1 text-sm">
                {e.couples.map((c) => (
                  <div
                    key={c.coupleId}
                    className={cn("flex items-center justify-between gap-3", c.tag === "eliminated" && "opacity-60")}
                  >
                    <span>
                      <CoupleName celebrity={c.celebrity} pro={c.pro} />
                    </span>
                    <span className="font-heading font-semibold">
                      {c.weeklyPoints >= 0 ? "+" : ""}
                      {c.weeklyPoints}
                    </span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
