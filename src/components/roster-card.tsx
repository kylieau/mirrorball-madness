import { formatPoints, formatSignedPoints } from "@/lib/format-points";
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoupleNameParts } from "@/lib/couple-display";
import { CoupleName } from "@/components/couple-name";
import type { RosterWeeklyTag } from "@/lib/roster-weekly-points";
import { IN_JEOPARDY_BADGE, showInJeopardyBadge } from "@/lib/results-outcome";
import { coupleHistoryHref } from "@/lib/couple-history-link";

export type RosterLifeline = CoupleNameParts & { coupleId: string; points: number };

type RosterCouple = CoupleNameParts & {
  coupleId: string;
  weeklyPoints: number;
  totalPoints?: number;
  tag: RosterWeeklyTag;
  inJeopardy: boolean;
};

// Same tag styling convention as weekly-results-view.tsx's outcomeTag —
// kept in sync intentionally so a couple reads the same way whether it's
// shown on This Week or on a manager's own roster.
const TAG_INFO: Record<RosterWeeklyTag, { label: string; className: string }> = {
  safe: { label: "Safe", className: "bg-emerald/20 text-emerald-text" },
  eliminated: { label: "Eliminated", className: "bg-muted text-muted-foreground" },
};

export function RosterCard({
  couples,
  totalPoints,
  weekBonusPoints = 0,
  lifelines = [],
  carousel,
  moves,
  leagueSection,
  historyFrom,
}: {
  couples: RosterCouple[];
  totalPoints: number;
  weekBonusPoints?: number;
  // Lifelines settled this week, in total-points units.
  lifelines?: RosterLifeline[];
  carousel?: ReactNode;
  moves?: ReactNode;
  leagueSection?: ReactNode;
  historyFrom: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Fantasy Roster</CardTitle>
        <CardDescription>
          <span className="font-heading font-semibold">{formatPoints(totalPoints)}</span> pts this week
        </CardDescription>
        {carousel}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {couples.map((c) => {
          const tag = TAG_INFO[c.tag];
          return (
            <Link
              key={c.coupleId}
              href={coupleHistoryHref(c.coupleId, historyFrom)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/60 active:bg-muted/40",
                c.tag === "eliminated" && "opacity-60"
              )}
            >
              <div>
                <p className="text-sm font-semibold">
                  <CoupleName celebrity={c.celebrity} pro={c.pro} />
                </p>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", tag.className)}>
                  {tag.label}
                </span>
                {showInJeopardyBadge(c.tag, c.inJeopardy) && (
                  <span
                    className={cn(
                      "ml-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                      IN_JEOPARDY_BADGE.className
                    )}
                  >
                    {IN_JEOPARDY_BADGE.label}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="block font-heading text-base font-semibold text-foreground">
                  {formatSignedPoints(c.weeklyPoints)}
                </span>
                {c.totalPoints !== undefined ? (
                  <>
                    <span className="font-heading font-semibold">{formatPoints(c.totalPoints)}</span> total
                  </>
                ) : (
                  "this wk"
                )}
              </div>
            </Link>
          );
        })}
        {weekBonusPoints > 0 && (
          <div className="flex items-center justify-between gap-3 px-3.5 text-xs text-muted-foreground">
            <span>Survival &amp; Bonuses</span>
            <span className="font-heading font-semibold">{formatSignedPoints(weekBonusPoints)}</span>
          </div>
        )}
        {lifelines.map((line) => (
          <div key={line.coupleId} className="flex items-center justify-between gap-3 px-3.5 text-xs text-muted-foreground">
            <span>
              Lifeline · <CoupleName celebrity={line.celebrity} pro={line.pro} />
            </span>
            <span className="font-heading font-semibold">{formatSignedPoints(line.points)}</span>
          </div>
        ))}
        {moves}
        {leagueSection}
      </CardContent>
    </Card>
  );
}
