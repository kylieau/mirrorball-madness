import { formatSignedPoints } from "@/lib/format-points";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import {
  collapsePickRows,
  partialVerdictLabel,
  type PastPicksComparison,
  type PastPicksDisplayRow,
  type PodiumMatch,
} from "@/lib/past-picks";
import { PODIUM_PLACE_LABELS, podiumOffLabel } from "@/lib/scoring";

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
  pickKind,
}: {
  rows: PastPicksDisplayRow[];
  names: Record<string, CoupleNameParts>;
  actualFallback: string;
  pickKind: "elimination" | "top_scorer";
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
                <span className="font-heading font-semibold text-emerald-text">{formatSignedPoints(row.points)}</span>
              </span>
            </div>
          );
        }

        if (row.kind === "partial") {
          return (
            <div
              key={`partial-${row.pickIds.join("-")}-${row.actualIds.join("-") || i}`}
              className="flex items-start justify-between gap-3"
            >
              <span className="text-amber-text">{partialVerdictLabel(pickKind, row.verdict)}</span>
              <span className="inline-flex max-w-[75%] flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right">
                <CoupleNames
                  ids={row.pickIds}
                  names={names}
                  fallback="—"
                  className="font-medium text-amber-text"
                />
                <span className="font-heading font-semibold text-amber-text">{formatSignedPoints(row.points)}</span>
                {row.actualIds.length > 0 && (
                  <>
                    <span className="text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <CoupleNames
                      ids={row.actualIds}
                      names={names}
                      fallback={actualFallback}
                      className="font-semibold text-foreground"
                    />
                  </>
                )}
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

// One row per place: the pick, how far off it finished and what it paid, then
// the couple that took the place when the pick wasn't it.
function PodiumRows({ podium, names }: { podium: PodiumMatch[]; names: Record<string, CoupleNameParts> }) {
  return (
    <>
      {podium.map((match, index) => {
        const label = PODIUM_PLACE_LABELS[index];
        const pickIds = match.pickId ? [match.pickId] : [];
        if (match.placesOff === 0) {
          return (
            <div key={label} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="inline-flex items-center justify-end gap-1.5 text-right font-medium">
                <CoupleNames ids={pickIds} names={names} fallback="—" />
                <span className="text-emerald-text" aria-label="Correct">
                  ✓
                </span>
                <span className="font-heading font-semibold text-emerald-text">{formatSignedPoints(match.points)}</span>
              </span>
            </div>
          );
        }

        const paid = match.points > 0;
        return (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className={paid ? "text-amber-text" : "text-muted-foreground"}>
              {label}
              {match.placesOff !== null && <span className="block text-xs">{podiumOffLabel(match.placesOff)}</span>}
            </span>
            <span className="inline-flex max-w-[75%] flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right">
              <CoupleNames
                ids={pickIds}
                names={names}
                fallback="No Pick"
                className={paid ? "font-medium text-amber-text" : "font-normal text-muted-foreground line-through"}
              />
              {paid && (
                <span className="font-heading font-semibold text-amber-text">{formatSignedPoints(match.points)}</span>
              )}
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <CoupleNames
                ids={match.actualId ? [match.actualId] : []}
                names={names}
                fallback="—"
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
  locked,
  comparison,
  coupleDisplayNames,
}: {
  locked: boolean;
  comparison: PastPicksComparison | null;
  coupleDisplayNames: Record<string, CoupleNameParts>;
}) {
  if (locked || !comparison) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Mark as watched from the banner above to see how you did</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {comparison.podium ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The Podium</p>
          <PodiumRows podium={comparison.podium} names={coupleDisplayNames} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who Went Home</p>
          <ResultRows
            rows={collapsePickRows(comparison.eliminationPicks, comparison.actualEliminatedIds)}
            names={coupleDisplayNames}
            actualFallback="Nobody"
            pickKind="elimination"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who Scored Highest</p>
        <ResultRows
          rows={collapsePickRows([comparison.topScorer], comparison.actualTopScorerIds)}
          names={coupleDisplayNames}
          actualFallback="—"
          pickKind="top_scorer"
        />
      </div>
      <div className="flex items-baseline justify-between border-t border-border pt-1">
        <span className="text-muted-foreground">Curtain Call</span>
        <span className="font-heading text-base font-semibold">
          {formatSignedPoints(comparison.predictionPoints)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">this wk</span>
        </span>
      </div>
    </div>
  );
}
