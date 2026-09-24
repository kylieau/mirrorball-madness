"use client";

import { LeagueGlanceHop } from "@/components/league-glance-hop";
import { formatPoints, formatSignedPoints } from "@/lib/format-points";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { PastPicksComparison, PickMatch } from "@/lib/past-picks";
import { usePersistedState } from "@/lib/use-persisted-state";

export type CurtainCallLeagueEntry = {
  managerId: string;
  displayName: string;
  eliminatedId: string | null;
  eliminatedId2: string | null;
  topScorerId: string | null;
  // null while this week's picks are locked but results aren't in yet.
  comparison: PastPicksComparison | null;
};

function PickPoints({ pick }: { pick: PickMatch }) {
  if (pick.verdict === "exact") {
    return <span className="font-heading font-semibold text-emerald-text">✓ +{formatPoints(pick.points)}</span>;
  }
  if (pick.verdict === "near_miss") {
    return (
      <span className="font-heading font-semibold text-amber-800 dark:text-amber-300">
        In Jeopardy +{formatPoints(pick.points)}
      </span>
    );
  }
  return <span className="font-heading font-semibold text-destructive">✗</span>;
}

// Lives inside CurtainCallCard's own CardContent, stacked after PickEmBox or
// PastPicksRecap, for whichever week the carousel is currently showing — no
// separate week resolution, no carousel changes. Other managers only; the
// viewer's own pick is already the card above it.
export function CurtainCallLeagueList({
  leagueId,
  weekId,
  weekNumber,
  isDoubleElimination,
  coupleDisplayNames,
  entries,
}: {
  leagueId: string;
  weekId: string;
  weekNumber: number;
  isDoubleElimination: boolean;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  entries: CurtainCallLeagueEntry[];
}) {
  const [expanded, setExpanded] = usePersistedState<string[]>(`cc-league-expanded:${leagueId}:${weekId}`, []);

  if (entries.length === 0) return null;

  function pickLines(e: CurtainCallLeagueEntry) {
    const lines = [{ label: "Home", coupleId: e.eliminatedId, pick: e.comparison?.eliminationPicks[0] }];
    if (isDoubleElimination) {
      lines.push({ label: "Home", coupleId: e.eliminatedId2, pick: e.comparison?.eliminationPicks[1] });
    }
    lines.push({ label: "High", coupleId: e.topScorerId, pick: e.comparison?.topScorer });
    return lines;
  }

  return (
    <LeagueGlanceHop>
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
                  {e.comparison ? (
                    <>
                      <span className="font-heading font-semibold">{formatSignedPoints(e.comparison.predictionPoints)}</span> pts
                    </>
                  ) : (
                    "Awaiting results"
                  )}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-1.5 text-sm">
                {pickLines(e).map((line, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-muted-foreground">{line.label}: </span>
                      {line.coupleId ? (
                        <CoupleName {...(coupleDisplayNames[line.coupleId] ?? { celebrity: "Unknown", pro: "Unknown" })} />
                      ) : (
                        <span className="text-muted-foreground">No Pick</span>
                      )}
                    </span>
                    {line.pick && <PickPoints pick={line.pick} />}
                  </div>
                ))}
                {!e.comparison && (
                  <p className="text-xs text-muted-foreground">Week {weekNumber} · locked · awaiting results</p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </LeagueGlanceHop>
  );
}
