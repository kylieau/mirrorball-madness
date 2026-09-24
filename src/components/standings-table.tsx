import { formatPoints } from "@/lib/format-points";
import { RankBadge } from "@/components/rank-badge";
import { StandingsLeaderboard, type LeaderboardRow } from "@/components/standings-leaderboard";
import type { ModuleTotals } from "@/components/score-history-panel";
import { formatEpisodeCasualShort } from "@/lib/format-week";

export function StandingsTable({
  leagueId,
  standings,
  currentUserId,
  latestCompletedWeek,
  viewerRank,
  viewerTotalPoints,
  categoryBreakdown,
  standingMessage,
  moduleTotals,
}: {
  leagueId: string;
  standings: LeaderboardRow[];
  currentUserId: string;
  latestCompletedWeek: number | null;
  viewerRank: number;
  viewerTotalPoints: number;
  categoryBreakdown: { label: string; icon: string; points: number }[];
  standingMessage: { placement: string; comment: string };
  moduleTotals: Record<string, Omit<ModuleTotals, "season">>;
}) {
  const sorted = [...standings].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div>
      <div className="flex items-center gap-3.5">
        <RankBadge rank={viewerRank} />
        <div>
          <p className="font-heading text-base font-semibold">{formatPoints(viewerTotalPoints)} pts</p>
          <p className="text-sm text-muted-foreground">of {standings.length} players</p>
        </div>
        {standingMessage.comment && (
          <p className="min-w-0 flex-1 pl-3 text-center text-[11px] italic leading-snug text-accent">
            {standingMessage.comment}
          </p>
        )}
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="mt-4 flex gap-2">
          {categoryBreakdown.map((c) => (
            <div key={c.label} className="flex-1 rounded-xl border border-border bg-card px-2 py-2.5 text-center">
              <p className="font-heading text-base font-semibold">{formatPoints(c.points)}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                <span aria-hidden>{c.icon}</span> {c.label}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2.5 mt-6 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-accent">Leaderboard</h2>
        <span className="text-xs text-muted-foreground">
          {latestCompletedWeek !== null
            ? `through ${formatEpisodeCasualShort(latestCompletedWeek)}`
            : "Results appear once you mark a week as watched"}
        </span>
      </div>

      <StandingsLeaderboard
        leagueId={leagueId}
        rows={sorted}
        currentUserId={currentUserId}
        moduleTotals={moduleTotals}
      />
    </div>
  );
}
