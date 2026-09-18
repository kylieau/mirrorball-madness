import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBadge } from "@/components/rank-badge";
import { formatEpisodeCasualShort } from "@/lib/format-week";

type StandingsRow = {
  managerId: string;
  displayName: string;
  totalPoints: number;
  change: "up" | "down" | null;
};

export function StandingsTable({
  standings,
  currentUserId,
  latestCompletedWeek,
  viewerRank,
  viewerTotalPoints,
  categoryBreakdown,
  standingMessage,
}: {
  standings: StandingsRow[];
  currentUserId: string;
  latestCompletedWeek: number | null;
  viewerRank: number;
  viewerTotalPoints: number;
  categoryBreakdown: { label: string; points: number }[];
  standingMessage: { placement: string; comment: string };
}) {
  const sorted = [...standings].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div>
      <div className="flex items-center gap-3.5">
        <RankBadge rank={viewerRank} />
        <div>
          <p className="font-heading text-base font-semibold">{viewerTotalPoints} pts</p>
          <p className="text-sm text-muted-foreground">of {standings.length} players</p>
        </div>
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="mt-4 flex gap-2">
          {categoryBreakdown.map((c) => (
            <div key={c.label} className="flex-1 rounded-xl border border-border bg-card px-2 py-2.5 text-center">
              <p className="font-heading text-base font-semibold">{c.points}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {standingMessage.comment && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{standingMessage.placement}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{standingMessage.comment}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
        <span>Leaderboard</span>
        <span className="font-normal text-muted-foreground">
          {latestCompletedWeek !== null
            ? `through ${formatEpisodeCasualShort(latestCompletedWeek)}`
            : "Results appear once you mark a week as watched"}
        </span>
      </div>

      <div className="flex flex-col">
        {sorted.map((row, i) => {
          const isYou = row.managerId === currentUserId;
          return (
            <div
              key={row.managerId}
              className={cn(
                "flex items-center gap-3 border-t border-border py-2.5 first:border-t-0",
                isYou && "-mx-2 rounded-lg border-t-0 border-l-2 border-l-primary bg-primary/8 px-2"
              )}
            >
              <span
                className={cn(
                  "w-5 font-heading text-sm font-semibold",
                  isYou ? "text-accent" : "text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-medium">
                {row.displayName}
                {isYou && " (you)"}
                <span className="block text-xs font-normal text-muted-foreground">
                  {row.totalPoints} pts
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                {row.totalPoints}
                {row.change === "up" && <span className="text-emerald-text">▲</span>}
                {row.change === "down" && <span className="text-danger-text">▼</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
