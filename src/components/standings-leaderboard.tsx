"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { getScoreHistory } from "@/app/leagues/[id]/score-history/actions";
import { ScoreHistoryPanel, type HistoryResult, type ModuleTotals } from "@/components/score-history-panel";
import { formatPoints, formatSignedPoints } from "@/lib/format-points";

export type LeaderboardRow = {
  managerId: string;
  displayName: string;
  totalPoints: number;
  weekPoints: number | null;
  change: "up" | "down" | null;
};

export function StandingsLeaderboard({
  leagueId,
  rows,
  currentUserId,
  moduleTotals,
}: {
  leagueId: string;
  rows: LeaderboardRow[];
  currentUserId: string;
  moduleTotals: Record<string, Omit<ModuleTotals, "season">>;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, HistoryResult>>({});

  function toggle(managerId: string) {
    if (openIds.includes(managerId)) {
      setOpenIds(openIds.filter((id) => id !== managerId));
      return;
    }
    setOpenIds([...openIds, managerId]);
    if (results[managerId]?.lines) return;
    getScoreHistory(leagueId, managerId).then((result) => setResults((prev) => ({ ...prev, [managerId]: result })));
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const isYou = row.managerId === currentUserId;
        const isOpen = openIds.includes(row.managerId);
        return (
          <div
            key={row.managerId}
            className={cn(
              "overflow-hidden rounded-xl border",
              isYou ? "border-primary/70 bg-primary/10" : "border-border bg-card"
            )}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Hide" : "Show"} score history for ${row.displayName}`}
              onClick={() => toggle(row.managerId)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
              <span aria-hidden className="w-3 text-[10px]">
                {row.change === "up" && <span className="text-emerald-text">▲</span>}
                {row.change === "down" && <span className="text-danger-text">▼</span>}
              </span>
              <span
                className={cn(
                  "w-5 text-center font-rank text-sm font-bold",
                  isYou ? "text-accent" : "text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {row.displayName}
                  {isYou && " (you)"}
                </span>
                {row.weekPoints !== null && (
                  <span className={cn("block font-heading text-xs", isYou ? "text-accent" : "text-muted-foreground")}>
                    {formatSignedPoints(row.weekPoints)}
                  </span>
                )}
              </span>
              <span className="font-heading text-sm font-semibold">{formatPoints(row.totalPoints)}</span>
              {isOpen ? (
                <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-accent" />
              ) : (
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {isOpen && (
              <div className="border-t border-border">
                <ScoreHistoryPanel
                  target={{ totals: { season: row.totalPoints, ...moduleTotals[row.managerId] } }}
                  result={results[row.managerId]}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
