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

// One per open roster spot in the paged week: the couple that left it, the
// Lifeline picked for it and, once the week is scored, what it paid in
// total-points units.
export type RosterLifeline = {
  slotNumber: number;
  former: (CoupleNameParts & { coupleId: string }) | null;
  pick: (CoupleNameParts & { coupleId: string }) | null;
  points: number | null;
};

type RosterCouple = CoupleNameParts & {
  coupleId: string;
  weeklyPoints: number;
  totalPoints?: number;
  tag: RosterWeeklyTag;
  inJeopardy: boolean;
  // Set on a couple that left this roster before the paged week: the weeks
  // it was held and, when someone has it now, who.
  former?: { weeks: string; note: string | null };
};

// Same tag styling convention as weekly-results-view.tsx's outcomeTag —
// kept in sync intentionally so a couple reads the same way whether it's
// shown on This Week or on a manager's own roster.
const TAG_INFO: Record<RosterWeeklyTag, { label: string; className: string }> = {
  safe: { label: "Safe", className: "bg-emerald/20 text-emerald-text" },
  eliminated: { label: "Eliminated", className: "bg-muted text-muted-foreground" },
  traded: { label: "Traded", className: "bg-muted text-muted-foreground" },
  dropped: { label: "Dropped", className: "bg-muted text-muted-foreground" },
};

export function RosterCard({
  couples,
  totalPoints,
  weekBonusPoints = 0,
  categoryWeight = 1,
  lifelines = [],
  lifelineHref,
  carousel,
  leagueSection,
  historyFrom,
  notScoredYet = false,
}: {
  couples: RosterCouple[];
  totalPoints: number;
  weekBonusPoints?: number;
  categoryWeight?: number;
  lifelines?: RosterLifeline[];
  // Where an open spot with no pick goes to get one; unset once it locks.
  lifelineHref?: string;
  carousel?: ReactNode;
  leagueSection?: ReactNode;
  historyFrom: string;
  // The paged week is still to come: who holds what, no points yet.
  notScoredYet?: boolean;
}) {
  const coupleCard = (c: RosterCouple) => {
    const tag = TAG_INFO[c.tag];
    return (
      <Link
        key={c.coupleId}
        href={coupleHistoryHref(c.coupleId, historyFrom)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/60 active:bg-muted/40",
          (c.tag === "eliminated" || c.former) && "opacity-60"
        )}
      >
        <div>
          <p className="text-sm font-semibold">
            <CoupleName celebrity={c.celebrity} pro={c.pro} />
          </p>
          {c.former && (
            <p className="mb-1 text-xs text-muted-foreground">
              {c.former.weeks}
              {c.former.note && ` · ${c.former.note}`}
            </p>
          )}
          {/* Safe is a result, which a week still to come doesn't have. */}
          {!(notScoredYet && c.tag === "safe") && (
            <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", tag.className)}>
              {tag.label}
            </span>
          )}
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
          {notScoredYet ? (
            <>
              <span className="block font-heading text-base font-semibold text-foreground">
                {formatPoints(c.totalPoints ?? 0)}
              </span>
              total
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Link>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Fantasy Roster</CardTitle>
        <CardDescription>
          {notScoredYet ? (
            "Not scored yet"
          ) : (
            <>
              <span className="font-heading font-semibold">{formatPoints(totalPoints)}</span> pts this week
            </>
          )}
        </CardDescription>
        {carousel}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {categoryWeight !== 1 && (
          <p className="text-xs text-muted-foreground">Points include your league’s × {categoryWeight} weight.</p>
        )}
        {couples.filter((c) => !c.former).map(coupleCard)}
        {lifelines.map((line) => (
          <LifelineSpotCard
            key={line.slotNumber}
            line={line}
            formerOnCard={couples.some((c) => !c.former && c.coupleId === line.former?.coupleId)}
            href={lifelineHref}
            historyFrom={historyFrom}
            notScoredYet={notScoredYet}
          />
        ))}
        {couples.filter((c) => c.former).map(coupleCard)}
        {weekBonusPoints > 0 && (
          <div className="flex items-center justify-between gap-3 px-3.5 text-xs text-muted-foreground">
            <span>Survival &amp; Bonuses</span>
            <span className="font-heading font-semibold">{formatSignedPoints(weekBonusPoints)}</span>
          </div>
        )}
        {leagueSection}
      </CardContent>
    </Card>
  );
}

const SPOT_CARD = "flex items-center justify-between gap-3 rounded-2xl border border-dashed px-3.5 py-3";
const TAG = "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold";

// An open spot sits on the roster as its own card, dashed to set it apart
// from a couple the manager holds: the Lifeline in it, or what's still to do.
function LifelineSpotCard({
  line,
  formerOnCard,
  href,
  historyFrom,
  notScoredYet,
}: {
  line: RosterLifeline;
  // The couple that left the spot is still held this week (it went home),
  // so its own card sits just above and naming it again is noise.
  formerOnCard: boolean;
  href?: string;
  historyFrom: string;
  notScoredYet: boolean;
}) {
  const inPlaceOf = line.former && !formerOnCard && (
    <p className="mb-1 text-xs text-muted-foreground">
      In place of <CoupleName celebrity={line.former.celebrity} pro={line.former.pro} />
    </p>
  );
  const points = !notScoredYet && (
    <div className="shrink-0 text-right text-xs text-muted-foreground">
      <span className="block font-heading text-base font-semibold text-foreground">{formatSignedPoints(line.points ?? 0)}</span>
      this wk
    </div>
  );

  if (!line.pick) {
    const content = (
      <>
        <div>
          <p className={cn("text-sm font-semibold", href ? "text-accent" : "text-muted-foreground")}>Open Spot</p>
          {inPlaceOf}
          <span className={cn(TAG, href ? "bg-primary/20 text-accent" : "bg-muted text-muted-foreground")}>
            {href ? "No Lifeline Yet" : "No Lifeline"}
          </span>
        </div>
        {href ? <span className="shrink-0 text-xs font-semibold text-accent">Pick ›</span> : points}
      </>
    );
    return href ? (
      <Link href={href} className={cn(SPOT_CARD, "border-primary transition-colors active:bg-muted/40")}>
        {content}
      </Link>
    ) : (
      <div className={cn(SPOT_CARD, "border-border opacity-60")}>{content}</div>
    );
  }

  return (
    <Link
      href={coupleHistoryHref(line.pick.coupleId, historyFrom)}
      className={cn(SPOT_CARD, "border-primary transition-colors hover:border-primary active:bg-muted/40")}
    >
      <div>
        <p className="text-sm font-semibold">
          <CoupleName celebrity={line.pick.celebrity} pro={line.pick.pro} />
        </p>
        {inPlaceOf}
        <span className={cn(TAG, "bg-primary/20 text-accent")}>Lifeline</span>
      </div>
      {notScoredYet ? (
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <span className="block font-heading text-base font-semibold text-foreground">½</span>
          their week
        </div>
      ) : (
        points
      )}
    </Link>
  );
}
