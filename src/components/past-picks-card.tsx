import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CoupleName } from "@/components/couple-name";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";
import { WeekSwitcher, type SwitcherWeek } from "@/components/week-switcher";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasualWithTheme } from "@/lib/format-week";
import {
  collapsePickRows,
  type PastPicksComparison,
  type PastPicksDisplayRow,
} from "@/lib/past-picks";

function CoupleNames({
  ids,
  names,
  fallback,
}: {
  ids: string[];
  names: Record<string, CoupleNameParts>;
  fallback: string;
}) {
  if (ids.length === 0) return <span className="font-normal text-muted-foreground">{fallback}</span>;
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <CoupleName {...(names[id] ?? { celebrity: "Unknown", pro: "Unknown" })} />
        </span>
      ))}
    </>
  );
}

function Mark({ hit }: { hit: boolean }) {
  return (
    <span className={hit ? "text-emerald-text" : "text-muted-foreground"} aria-label={hit ? "Correct" : "Miss"}>
      {hit ? "✓" : "✗"}
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
        const label = row.kind === "nailed" ? "Nailed it" : row.kind === "you" ? "You" : "Actual";
        const fallback = row.kind === "you" ? "No pick" : actualFallback;
        const showMark = row.kind === "nailed" || (row.kind === "you" && row.coupleIds.length > 0);
        return (
          <div key={`${row.kind}-${row.coupleIds.join("-") || i}`} className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="inline-flex items-center justify-end gap-1.5 text-right font-medium">
              <CoupleNames ids={row.coupleIds} names={names} fallback={fallback} />
              {showMark && <Mark hit={row.kind === "nailed"} />}
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
  weeks: SwitcherWeek[];
  locked: boolean;
  comparison: PastPicksComparison | null;
  coupleDisplayNames: Record<string, CoupleNameParts>;
}) {
  const episodeLabel = formatEpisodeCasualWithTheme(episode.weekNumber, episode.theme);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past picks</CardTitle>
        <CardDescription>{episodeLabel}</CardDescription>
        {weeks.length > 1 && (
          <CardAction>
            <WeekSwitcher
              currentEpisodeId={episode.id}
              weeks={weeks.map((w) => ({
                ...w,
                href: `/leagues/${leagueId}?tab=yourpicks&week=${w.id}`,
              }))}
            />
          </CardAction>
        )}
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
