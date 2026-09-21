import { CoupleName } from "@/components/couple-name";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import type { CoupleNameParts } from "@/lib/couple-display";
import {
  collapsePickRows,
  type PastPicksComparison,
  type PastPicksDisplayRow,
} from "@/lib/past-picks";

function CoupleNames({
  ids,
  names,
  fallback,
  className,
}: {
  ids: string[];
  names: Record<string, CoupleNameParts>;
  fallback: string;
  className?: string;
}) {
  if (ids.length === 0) {
    return <span className={className ?? "font-normal text-muted-foreground"}>{fallback}</span>;
  }
  return (
    <span className={className}>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <CoupleName {...(names[id] ?? { celebrity: "Unknown", pro: "Unknown" })} />
        </span>
      ))}
    </span>
  );
}

function ResultRows({
  rows,
  names,
  actualFallback,
}: {
  rows: PastPicksDisplayRow[];
  names: Record<string, CoupleNameParts>;
  actualFallback: string;
}) {
  return (
    <>
      {rows.map((row, i) => {
        if (row.kind === "nailed") {
          return (
            <div key={`nailed-${row.coupleIds.join("-") || i}`} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Nailed It</span>
              <span className="inline-flex items-center justify-end gap-1.5 text-right font-medium">
                <CoupleNames ids={row.coupleIds} names={names} fallback="—" />
                <span className="text-emerald-text" aria-label="Correct">
                  ✓
                </span>
              </span>
            </div>
          );
        }

        return (
          <div
            key={`miss-${row.pickIds.join("-")}-${row.actualIds.join("-") || i}`}
            className="flex items-start justify-between gap-3"
          >
            <span className="text-muted-foreground">You</span>
            <span className="inline-flex max-w-[75%] flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right">
              {row.pickIds.length > 0 ? (
                <CoupleNames
                  ids={row.pickIds}
                  names={names}
                  fallback="No Pick"
                  className="font-normal text-muted-foreground line-through"
                />
              ) : (
                <span className="font-normal text-muted-foreground">No Pick</span>
              )}
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <CoupleNames
                ids={row.actualIds}
                names={names}
                fallback={actualFallback}
                className="font-semibold text-foreground"
              />
            </span>
          </div>
        );
      })}
    </>
  );
}

export function PastPicksRecap({
  episodeWeekNumber,
  locked,
  comparison,
  coupleDisplayNames,
}: {
  episodeWeekNumber: number;
  locked: boolean;
  comparison: PastPicksComparison | null;
  coupleDisplayNames: Record<string, CoupleNameParts>;
}) {
  if (locked || !comparison) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Mark as watched to see how you did</p>
        <MarkWeekWatchedButton weekNumber={episodeWeekNumber} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who Went Home</p>
        <ResultRows
          rows={collapsePickRows(comparison.eliminationPicks, comparison.actualEliminatedIds)}
          names={coupleDisplayNames}
          actualFallback="Nobody"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who Scored Highest</p>
        <ResultRows
          rows={collapsePickRows([comparison.topScorer], comparison.actualTopScorerIds)}
          names={coupleDisplayNames}
          actualFallback="—"
        />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-muted-foreground">Curtain Call</span>
        <span className="font-heading text-base font-semibold">
          {comparison.predictionPoints >= 0 ? "+" : ""}
          {comparison.predictionPoints}
          <span className="ml-1 text-xs font-normal text-muted-foreground">this wk</span>
        </span>
      </div>
    </div>
  );
}
