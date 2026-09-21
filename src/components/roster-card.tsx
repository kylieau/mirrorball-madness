import type { ReactNode } from "react";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoupleNameParts } from "@/lib/couple-display";
import { CoupleName } from "@/components/couple-name";
import type { RosterWeeklyTag } from "@/lib/roster-weekly-points";

type RosterCouple = CoupleNameParts & {
  coupleId: string;
  weeklyPoints: number;
  totalPoints?: number;
  tag: RosterWeeklyTag;
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
  carousel,
}: {
  couples: RosterCouple[];
  totalPoints: number;
  carousel?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Fantasy Roster</CardTitle>
        <CardDescription>{totalPoints} points this season</CardDescription>
        {carousel}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {couples.map((c) => {
          const tag = TAG_INFO[c.tag];
          return (
            <div
              key={c.coupleId}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3",
                c.tag === "eliminated" && "opacity-60"
              )}
            >
              <div>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", tag.className)}>
                  {tag.label}
                </span>
                <p className="text-sm font-semibold">
                  <CoupleName celebrity={c.celebrity} pro={c.pro} />
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="block font-heading text-base font-semibold text-foreground">
                  {c.weeklyPoints >= 0 ? "+" : ""}
                  {c.weeklyPoints}
                </span>
                {c.totalPoints !== undefined ? `${c.totalPoints} total` : "this wk"}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
