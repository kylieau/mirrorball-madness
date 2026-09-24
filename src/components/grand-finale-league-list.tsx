"use client";

import { LeagueGlanceHop } from "@/components/league-glance-hop";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GrandFinaleOrderList, type GrandFinaleCouple, type GrandFinaleScoring } from "@/components/grand-finale-order-list";
import { coupleNameNode } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { nextPredictedElimination } from "@/lib/grand-finale-pins";
import type { LeagueGrandFinalePrediction } from "@/lib/grand-finale-predictions";
import { usePersistedState } from "@/lib/use-persisted-state";

// Lives inside GrandFinaleBox's own Card, appended after the viewer's own
// bracket, once the season-wide deadline has passed — no separate card, no
// week concept (Grand Finale has none). "Next elim" for every manager is
// computed against the VIEWER's own spoiler-clamped couples (never a
// per-manager cutoff), so a viewer behind on watching is never spoiled by
// another manager's bracket appearing to jump ahead. Other managers only —
// the viewer's own bracket is the card above.
export function GrandFinaleLeagueList({
  leagueId,
  managers,
  couples,
  coupleDisplayNames,
  scoring,
}: {
  leagueId: string;
  managers: LeagueGrandFinalePrediction[];
  couples: GrandFinaleCouple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  scoring: GrandFinaleScoring;
}) {
  const [expanded, setExpanded] = usePersistedState<string[]>(`gf-league-expanded:${leagueId}`, []);
  const coupleById = new Map(couples.map((c) => [c.id, c]));

  function nameFor(coupleId: string | null) {
    if (!coupleId) return "Nobody left to predict";
    const c = coupleById.get(coupleId);
    return coupleNameNode(
      coupleDisplayNames[coupleId] ?? { celebrity: c?.celebrity_name ?? "Unknown", pro: c?.pro_name ?? "Unknown" }
    );
  }

  if (managers.length === 0) return null;

  return (
    <LeagueGlanceHop>
      <Accordion multiple value={expanded} onValueChange={setExpanded}>
        {managers.map((m) => (
          <AccordionItem key={m.managerId} value={m.managerId}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold">
                  {m.displayName.charAt(0).toUpperCase()}
                </span>
                <span>
                  {m.displayName}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Next elim: {nameFor(nextPredictedElimination(m.order, couples))}
                  </span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <GrandFinaleOrderList
                order={m.order}
                couples={couples}
                coupleDisplayNames={coupleDisplayNames}
                scoring={scoring}
                totalCouples={couples.length}
                showStatus
                showNextEliminationHighlight
                windowed
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </LeagueGlanceHop>
  );
}
