"use client";

import { LeagueGlanceHop } from "@/components/league-glance-hop";
import { formatSignedPoints } from "@/lib/format-points";
import { cn } from "cn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CoupleNameLink } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { usePersistedState } from "@/lib/use-persisted-state";

export type DanceCardLeagueEntry = {
  managerId: string;
  displayName: string;
  weekPoints: number;
  bonusPoints: number;
  lifelines: (CoupleNameParts & { coupleId: string; points: number })[];
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
  historyFrom,
}: {
  leagueId: string;
  weekId: string;
  entries: DanceCardLeagueEntry[];
  historyFrom: string;
}) {
  const [expanded, setExpanded] = usePersistedState<string[]>(`dc-league-expanded:${leagueId}:${weekId}`, []);

  if (entries.length === 0) return null;

  return (
    <LeagueGlanceHop>
      <Accordion multiple value={expanded} onValueChange={setExpanded}>
        {entries.map((e) => (
          <AccordionItem key={e.managerId} value={e.managerId}>
            <AccordionTrigger className="min-w-0">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold">
                  {e.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 break-words">{e.displayName}</span>
                <span className="ml-auto shrink-0 pr-2 text-xs font-normal text-muted-foreground">
                  <span className="font-heading font-semibold">{formatSignedPoints(e.weekPoints)}</span> pts
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="[&_a]:no-underline [&_a]:hover:text-accent">
              <div className="flex flex-col gap-1 text-sm">
                {e.couples.map((c) => (
                  <div
                    key={c.coupleId}
                    className={cn("flex items-center justify-between gap-3", c.tag === "eliminated" && "opacity-60")}
                  >
                    <span>
                      <CoupleNameLink coupleId={c.coupleId} from={historyFrom} celebrity={c.celebrity} pro={c.pro} />
                    </span>
                    <span className="font-heading font-semibold">
                      {formatSignedPoints(c.weeklyPoints)}
                    </span>
                  </div>
                ))}
                {e.bonusPoints > 0 && (
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Survival &amp; Bonuses</span>
                    <span className="font-heading font-semibold">{formatSignedPoints(e.bonusPoints)}</span>
                  </div>
                )}
                {e.lifelines.map((line) => (
                  <div key={line.coupleId} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      Lifeline · <CoupleNameLink coupleId={line.coupleId} from={historyFrom} celebrity={line.celebrity} pro={line.pro} />
                    </span>
                    <span className="font-heading font-semibold">{formatSignedPoints(line.points)}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </LeagueGlanceHop>
  );
}
