"use client";

import { formatPoints, roundPoints } from "@/lib/format-points";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { coupleNameNode } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasualAbbreviated } from "@/lib/format-week";
import { nextPredictedElimination, pinnedEliminatedIds, type PinnableCouple } from "@/lib/grand-finale-pins";
import { explainGrandFinaleMethod } from "@/lib/grand-finale-explainer";
import {
  eliminationPositionRanges,
  grandFinaleBestCasePoints,
  grandFinalePredictionPoints,
  type GrandFinaleMethod,
  type TierPayStyle,
} from "@/lib/scoring";

export type GrandFinaleCouple = PinnableCouple & { pro_name: string };

export type GrandFinaleScoring = {
  method: GrandFinaleMethod;
  pointsPerCorrect: number;
  distancePenalty: number | null;
  tierSize: number | null;
  tierPayStyle: TierPayStyle;
};

export function statusLabel(couple: GrandFinaleCouple): string {
  switch (couple.status) {
    case "winner":
      return "Won the season";
    case "runner_up":
      return "Runner-up";
    case "third_place":
      return "Third Place";
    case "eliminated":
      return `${formatEpisodeCasualAbbreviated(couple.elimination_week!)} Elim`;
    case "withdrawn":
      return `${formatEpisodeCasualAbbreviated(couple.elimination_week!)} Withdrew`;
    default:
      return "Active";
  }
}

// Gold "Next Predicted Elimination" bubble sitting on the top edge of the
// framed row; the row's own text keeps its normal color.
export function NextEliminationFrame({ children }: { children: ReactNode }) {
  return (
    <div data-next-elim className="relative mt-3 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1.5">
      <span className="absolute -top-2.5 left-2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
        Next Predicted Elimination
      </span>
      {children}
    </div>
  );
}

// What a row is worth given the season so far. Positions and the open slot
// come from the viewer's spoiler-clamped couples, same as everything else.
export function grandFinaleRowContext(couples: GrandFinaleCouple[]) {
  return {
    positionRanges: eliminationPositionRanges(couples),
    firstOpenPosition: pinnedEliminatedIds(couples).length + 1,
  };
}

// Awarded points for a couple whose fate is already resolved (same math the
// scoring engine uses); for a couple still in the running, the muted best
// case it can still reach — nothing is earned until it actually goes home.
export function PointsTag({
  couple,
  predictedPosition,
  scoring,
  totalCouples,
  context,
}: {
  couple: GrandFinaleCouple | undefined;
  predictedPosition: number;
  scoring: GrandFinaleScoring;
  totalCouples: number;
  context: ReturnType<typeof grandFinaleRowContext>;
}) {
  if (!couple) return null;
  const range = context.positionRanges.get(couple.id);
  if (range) {
    const points = roundPoints(
      grandFinalePredictionPoints({
        ...scoring,
        totalCouples,
        predictedPosition,
        actualPosition: range.start,
        actualPositionEnd: range.end,
      })
    );
    return (
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
          points > 0 ? "bg-emerald/20 text-emerald-text" : "bg-destructive/15 text-destructive"
        )}
      >
        +{formatPoints(points)} pts
      </span>
    );
  }
  if (couple.status === "eliminated" || couple.status === "withdrawn") return null;
  const bestCase = roundPoints(
    grandFinaleBestCasePoints({
      ...scoring,
      totalCouples,
      predictedPosition,
      firstOpenPosition: context.firstOpenPosition,
    })
  );
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      up to {formatPoints(bestCase)} pts
    </span>
  );
}

// One prose explanation of how this league's Grand Finale scoring works,
// straight from the same math the settings page uses — so a manager building
// their bracket sees exactly what a settings-page commissioner sees, never a
// second, hand-written description that could drift from the real numbers.
export function GrandFinaleScoringExplainer({
  scoring,
  totalCouples,
}: {
  scoring: GrandFinaleScoring;
  totalCouples: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 self-start font-medium"
      >
        How Points Work
        <ChevronDownIcon className={cn("size-3.5 shrink-0", open && "rotate-180")} />
      </button>
      {open && <p>{explainGrandFinaleMethod({ ...scoring, totalCouples })}</p>}
    </div>
  );
}

// Shared row-rendering for both a manager's own bracket (select/edit's "Order
// So Far" preview, and the saved/locked summary) and the League at a Glance
// expanded view for another manager — one place for statusLabel, the
// point-ceiling tag, and the next-elimination highlight so they can't drift
// between "your bracket" and "everyone else's."
export function GrandFinaleOrderList({
  order,
  couples,
  coupleDisplayNames,
  scoring,
  totalCouples,
  showStatus,
  showNextEliminationHighlight,
  windowed = false,
}: {
  order: string[]; // elimination-ascending: index 0 = first predicted out, last = predicted winner
  couples: GrandFinaleCouple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  scoring: GrandFinaleScoring;
  totalCouples: number;
  showStatus: boolean;
  showNextEliminationHighlight: boolean;
  // Caps the list's height and scrolls the next-elimination row to the middle,
  // so the couples around it show first and the rest are a scroll away.
  windowed?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const coupleById = new Map(couples.map((c) => [c.id, c]));
  const rowContext = grandFinaleRowContext(couples);
  const highlightId = showNextEliminationHighlight ? nextPredictedElimination(order, couples) : null;

  function nameFor(coupleId: string) {
    const c = coupleById.get(coupleId);
    return coupleNameNode(
      coupleDisplayNames[coupleId] ?? { celebrity: c?.celebrity_name ?? "Unknown", pro: c?.pro_name ?? "Unknown" }
    );
  }

  useEffect(() => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>("[data-next-elim]");
    if (!windowed || !container || !target) return;
    container.scrollTop = target.offsetTop - container.clientHeight / 2 + target.offsetHeight / 2;
  }, [windowed]);

  return (
    <div ref={scrollRef} className={cn("flex flex-col gap-1", windowed && "relative max-h-52 overflow-y-auto pr-1")}>
      {/* Displayed winner-first (reverse of storage order, which stays
          elimination-ascending), so "1." lines up with the predicted winner. */}
      {[...order].reverse().map((coupleId, i) => {
        const couple = coupleById.get(coupleId);
        const isHighlighted = coupleId === highlightId;
        const predictedPosition = order.length - i;

        const row = (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              {i + 1}. {nameFor(coupleId)}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <PointsTag
                couple={couple}
                predictedPosition={predictedPosition}
                scoring={scoring}
                totalCouples={totalCouples}
                context={rowContext}
              />
              {showStatus && (
                <span className="text-muted-foreground">{couple ? statusLabel(couple) : "Unknown"}</span>
              )}
            </span>
          </div>
        );

        return isHighlighted ? (
          <NextEliminationFrame key={coupleId}>{row}</NextEliminationFrame>
        ) : (
          <div key={coupleId} className="border-b border-border py-1 last:border-b-0">
            {row}
          </div>
        );
      })}
    </div>
  );
}
