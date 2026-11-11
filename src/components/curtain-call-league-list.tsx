"use client";

import type { ReactNode } from "react";
import { LeagueGlanceHop } from "@/components/league-glance-hop";
import { formatPoints, formatSignedPoints } from "@/lib/format-points";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CoupleNameLink } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import type { CurtainCallPick } from "@/lib/curtain-call-picks";
import { partialVerdictLabel, type PastPicksComparison, type PickMatch, type PodiumMatch } from "@/lib/past-picks";
import { podiumOffLabel } from "@/lib/scoring";
import { usePersistedState } from "@/lib/use-persisted-state";

export type CurtainCallLeagueEntry = {
  managerId: string;
  displayName: string;
  pick: CurtainCallPick;
  // null while this week's picks are locked but results aren't in yet.
  comparison: PastPicksComparison | null;
};

function PickPoints({ pick, pickKind }: { pick: PickMatch; pickKind: "elimination" | "top_scorer" }) {
  if (pick.verdict === "exact") {
    return <span className="font-heading font-semibold text-emerald-text">✓ +{formatPoints(pick.points)}</span>;
  }
  if (pick.verdict === "near_miss" || pick.verdict === "near_miss_2") {
    return (
      <span className="font-heading font-semibold text-amber-text">
        {partialVerdictLabel(pickKind, pick.verdict)} +{formatPoints(pick.points)}
      </span>
    );
  }
  return <span className="font-heading font-semibold text-danger-text">✗</span>;
}

function PodiumPoints({ match }: { match: PodiumMatch }) {
  if (match.placesOff === 0) {
    return <span className="font-heading font-semibold text-emerald-text">✓ +{formatPoints(match.points)}</span>;
  }
  if (match.placesOff !== null && match.points > 0) {
    return (
      <span className="font-heading font-semibold text-amber-text">
        {podiumOffLabel(match.placesOff)} +{formatPoints(match.points)}
      </span>
    );
  }
  return <span className="font-heading font-semibold text-danger-text">✗</span>;
}

const PODIUM_LINE_LABELS = ["Win", "2nd", "3rd"];

// Lives inside CurtainCallCard's own CardContent, stacked after PickEmBox or
// PastPicksRecap, for whichever week the carousel is currently showing — no
// separate week resolution, no carousel changes. Other managers only; the
// viewer's own pick is already the card above it.
export function CurtainCallLeagueList({
  leagueId,
  weekId,
  weekNumber,
  isDoubleElimination,
  isFinale,
  coupleDisplayNames,
  entries,
  historyFrom,
}: {
  leagueId: string;
  weekId: string;
  weekNumber: number;
  isDoubleElimination: boolean;
  isFinale: boolean;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  entries: CurtainCallLeagueEntry[];
  historyFrom: string;
}) {
  const [expanded, setExpanded] = usePersistedState<string[]>(`cc-league-expanded:${leagueId}:${weekId}`, []);

  if (entries.length === 0) return null;

  function pickLines(e: CurtainCallLeagueEntry): { label: string; coupleId: string | null; points: ReactNode }[] {
    const scored = (pick: PickMatch | undefined, pickKind: "elimination" | "top_scorer") =>
      pick && <PickPoints pick={pick} pickKind={pickKind} />;
    const high = { label: "High", coupleId: e.pick.topScorer, points: scored(e.comparison?.topScorer, "top_scorer") };
    if (isFinale) {
      return [
        ...PODIUM_LINE_LABELS.map((label, index) => {
          const match = e.comparison?.podium?.[index];
          return { label, coupleId: e.pick.podium[index], points: match && <PodiumPoints match={match} /> };
        }),
        high,
      ];
    }
    const home = (coupleId: string | null, index: number) => ({
      label: "Home",
      coupleId,
      points: scored(e.comparison?.eliminationPicks[index], "elimination"),
    });
    return [home(e.pick.elim1, 0), ...(isDoubleElimination ? [home(e.pick.elim2, 1)] : []), high];
  }

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
            <AccordionContent className="[&_a]:no-underline [&_a]:hover:text-accent">
              <div className="flex flex-col gap-1.5 text-sm">
                {pickLines(e).map((line, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-muted-foreground">{line.label}: </span>
                      {line.coupleId ? (
                        <CoupleNameLink
                          coupleId={line.coupleId}
                          from={historyFrom}
                          {...(coupleDisplayNames[line.coupleId] ?? { celebrity: "Unknown", pro: "Unknown" })}
                        />
                      ) : (
                        <span className="text-muted-foreground">No Pick</span>
                      )}
                    </span>
                    {line.points}
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
