import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CoupleName } from "@/components/couple-name";
import { EpisodeCarousel } from "@/components/episode-carousel";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import type { CoupleNameParts } from "@/lib/couple-display";
import {
  collapsePickRows,
  type PastPicksComparison,
  type PastPicksDisplayRow,
} from "@/lib/past-picks";
import { adjacentThisWeekWeeks, pastPicksHref } from "@/lib/this-week-carousel";

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
              <span className="text-muted-foreground">Nailed it</span>
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
                  fallback="No pick"
                  className="font-normal text-muted-foreground line-through"
                />
              ) : (
                <span className="font-normal text-muted-foreground">No pick</span>
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

export function PastPicksCard({
  leagueId,
  episode,
  weeks,
  locked,
  comparison,
  coupleDisplayNames,
}: {
  leagueId: string;
  episode: { id: string; weekNumber: number; theme: string | null };
  weeks: { id: string; weekNumber: number; theme: string | null }[];
  locked: boolean;
  comparison: PastPicksComparison | null;
  coupleDisplayNames: Record<string, CoupleNameParts>;
}) {
  const carouselWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const neighbors = adjacentThisWeekWeeks(carouselWeeks, episode.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past picks</CardTitle>
        <EpisodeCarousel
          weekNumber={episode.weekNumber}
          theme={episode.theme}
          prevHref={neighbors.prev ? pastPicksHref(leagueId, neighbors.prev.id) : null}
          nextHref={neighbors.next ? pastPicksHref(leagueId, neighbors.next.id) : null}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {locked || !comparison ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Mark as watched to see how you did</p>
            <MarkWeekWatchedButton weekNumber={episode.weekNumber} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who went home</p>
              <ResultRows
                rows={collapsePickRows(comparison.eliminationPicks, comparison.actualEliminatedIds)}
                names={coupleDisplayNames}
                actualFallback="Nobody"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Who scored highest
              </p>
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
        )}
      </CardContent>
    </Card>
  );
}
