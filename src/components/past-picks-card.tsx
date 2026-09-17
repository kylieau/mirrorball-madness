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
import type { PastPicksComparison, PickMatch } from "@/lib/past-picks";

function CoupleNames({
  ids,
  names,
  fallback,
}: {
  ids: string[];
  names: Record<string, CoupleNameParts>;
  fallback: string;
}) {
  if (ids.length === 0) return <>{fallback}</>;
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

function PickLine({
  match,
  names,
}: {
  match: PickMatch;
  names: Record<string, CoupleNameParts>;
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 text-right font-medium">
      {match.pickId ? (
        <CoupleName {...(names[match.pickId] ?? { celebrity: "Unknown", pro: "Unknown" })} />
      ) : (
        <span className="font-normal text-muted-foreground">No pick</span>
      )}
      {match.pickId && (
        <span
          className={match.correct ? "text-emerald-text" : "text-muted-foreground"}
          aria-label={match.correct ? "Correct" : "Miss"}
        >
          {match.correct ? "✓" : "✗"}
        </span>
      )}
    </span>
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
  const switcher = (
    <WeekSwitcher
      currentEpisodeId={episode.id}
      weeks={weeks}
      hrefFor={(w) => `/leagues/${leagueId}?tab=yourpicks&week=${w.id}`}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past picks</CardTitle>
        <CardDescription>
          {weeks.length > 1 ? "How your Curtain Call picks lined up" : episodeLabel}
        </CardDescription>
        {weeks.length > 1 && <CardAction>{switcher}</CardAction>}
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
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">You</span>
                <span className="flex flex-col items-end gap-1">
                  {comparison.eliminationPicks.map((match, i) => (
                    <PickLine key={match.pickId ?? `elim-${i}`} match={match} names={coupleDisplayNames} />
                  ))}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">Actual</span>
                <span className="text-right font-medium">
                  <CoupleNames
                    ids={comparison.actualEliminatedIds}
                    names={coupleDisplayNames}
                    fallback="Nobody"
                  />
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Who scored highest
              </p>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">You</span>
                <PickLine match={comparison.topScorer} names={coupleDisplayNames} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">Actual</span>
                <span className="text-right font-medium">
                  <CoupleNames
                    ids={comparison.actualTopScorerIds}
                    names={coupleDisplayNames}
                    fallback="—"
                  />
                </span>
              </div>
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
