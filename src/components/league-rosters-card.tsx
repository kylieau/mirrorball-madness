import { formatPoints, formatSignedPoints } from "@/lib/format-points";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";

type RosterCouple = CoupleNameParts & { coupleId: string; eliminated?: boolean; points?: { week?: number; total: number } };

export type RosterGroup = {
  managerId: string;
  displayName: string;
  isViewer: boolean;
  couples: RosterCouple[];
};

function CoupleLine({ couple }: { couple: RosterCouple }) {
  return (
    <p className={cn("flex items-center justify-between gap-2 text-sm", couple.eliminated && "opacity-60")}>
      <span>
        <CoupleName celebrity={couple.celebrity} pro={couple.pro} />
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {couple.eliminated && <span className="text-xs text-muted-foreground">Eliminated</span>}
        {couple.points && (
          <span className="text-right tabular-nums">
            {couple.points.week !== undefined ? (
              <>
                <span className="font-heading font-semibold">
                  {couple.points.week > 0 ? formatSignedPoints(couple.points.week) : "—"}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  <span className="font-heading font-semibold">{formatPoints(couple.points.total)}</span> total
                </span>
              </>
            ) : (
              <span className="font-heading font-semibold">{formatPoints(couple.points.total)} pts</span>
            )}
          </span>
        )}
      </span>
    </p>
  );
}

export function LeagueRostersCard({
  title = "Dance Cards",
  description,
  groups,
  unrostered = [],
  unrosteredLabel,
}: {
  title?: string;
  description: string;
  groups: RosterGroup[];
  unrostered?: RosterCouple[];
  unrosteredLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.managerId} className="flex flex-col gap-1.5 rounded-2xl border border-border px-3.5 py-3">
            <p className="text-sm font-semibold">
              {g.displayName}
              {g.isViewer && <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>}
            </p>
            {g.couples.map((c) => (
              <CoupleLine key={c.coupleId} couple={c} />
            ))}
          </div>
        ))}
        {unrosteredLabel && unrostered.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-border px-3.5 py-3">
            <p className="text-sm font-semibold text-muted-foreground">{unrosteredLabel}</p>
            {unrostered.map((c) => (
              <CoupleLine key={c.coupleId} couple={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
