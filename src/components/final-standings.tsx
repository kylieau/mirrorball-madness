import { cn } from "cn";
import { YouPill } from "@/components/you-pill";
import { formatPoints } from "@/lib/format-points";
import { scoringModule, type ScoringModuleKey } from "@/lib/scoring-modules";
import { placeByPoints } from "@/lib/season-wrap";

type Standing = { managerId: string; displayName: string; totalPoints: number };

// The season wrap's top of Standings: a podium for the top three managers
// (2nd, 1st, 3rd left to right) and who led each module on, from the same
// stored module totals the leaderboard rows show.
export function FinalStandings({
  standings,
  viewerId,
  moduleTotals,
}: {
  standings: Standing[];
  viewerId: string;
  moduleTotals: Record<string, Partial<Record<ScoringModuleKey, number | null>>>;
}) {
  const totals = standings.map((s) => s.totalPoints);
  const top = [...standings].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);
  // 2nd, 1st, 3rd left to right; tied totals share a place and a crown.
  const podium = [top[1], top[0], top[2]].flatMap((s) => (s ? [{ standing: s, place: placeByPoints(s.totalPoints, totals) }] : []));
  // Everyone tied for a module's top total leads it.
  const leaders = (["curtainCall", "danceCard", "grandFinale"] as const).flatMap((key) => {
    const rows = standings
      .map((s) => ({ s, points: moduleTotals[s.managerId]?.[key] }))
      .filter((row): row is { s: Standing; points: number } => row.points != null);
    const best = Math.max(...rows.map((row) => row.points));
    const tied = rows.filter((row) => row.points === best);
    return tied.length > 0 ? [{ key, managers: tied.map((row) => row.s), points: best }] : [];
  });
  if (top.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 items-end gap-1.5 text-center">
        {podium.map(({ standing, place }) => (
          <div
            key={standing.managerId}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-t-xl rounded-b-md px-1.5 pt-2.5 pb-2",
              place === 1 ? "bg-linear-to-b from-primary/35 to-primary/10 pt-4" : "bg-muted"
            )}
          >
            {place === 1 && <span aria-hidden>👑</span>}
            <span className="font-rank text-xl font-bold">{place}</span>
            <span className="flex max-w-full flex-wrap items-center justify-center gap-1 text-[13px] font-semibold">
              <span className="truncate">{standing.displayName}</span>
              {standing.managerId === viewerId && <YouPill />}
            </span>
            <span className="font-heading text-[13px] text-muted-foreground">{formatPoints(standing.totalPoints)}</span>
          </div>
        ))}
      </div>
      {leaders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-accent">Module Leaders</p>
          {leaders.map(({ key, managers, points }) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <span className="shrink-0">
                <span aria-hidden>{scoringModule(key).icon}</span> {scoringModule(key).name}
              </span>
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-right">
                {managers.map((s, i) => (
                  <span key={s.managerId} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">&amp;</span>}
                    {s.displayName}
                    {s.managerId === viewerId && <YouPill />}
                  </span>
                ))}
                <span className="font-heading">· {formatPoints(points)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
