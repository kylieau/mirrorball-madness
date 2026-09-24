"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import type { getScoreHistory } from "@/app/leagues/[id]/score-history/actions";
import { formatEpisodeCasualShort } from "@/lib/format-week";
import { formatPoints, formatSignedPoints, roundPoints } from "@/lib/format-points";
import { groupHistory, HIT_MARK, type HistoryModule } from "@/lib/score-history";
import { SCORING_MODULES, scoringModule, type ScoringModuleKey } from "@/lib/scoring-modules";

export type ModuleTotals = { season: number } & Record<ScoringModuleKey, number | null>;

export type HistoryTarget = { totals: ModuleTotals };

export type HistoryResult = Awaited<ReturnType<typeof getScoreHistory>>;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function ScoreHistoryPanel({ target, result }: { target: HistoryTarget; result: HistoryResult | undefined }) {
  const [totalsOpen, setTotalsOpen] = useState(false);
  const [selected, setSelected] = useState<HistoryModule[]>([]);
  const enabledModules = SCORING_MODULES.filter((m) => target.totals[m.key] !== null);
  const groups = result?.lines ? groupHistory(result.lines, selected) : [];
  const selectedModules = enabledModules.filter((m) => selected.includes(m.key));
  const isAll = selectedModules.length === 0;
  const totalsShown = isAll ? enabledModules : selectedModules;
  const combinedTotal = roundPoints(selectedModules.reduce((sum, m) => sum + (target.totals[m.key] ?? 0), 0));

  function toggleModule(key: HistoryModule) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    setSelected(next.length === enabledModules.length ? [] : next);
  }

  const hasBreakdown = totalsShown.length > 1;
  const totalLabel = isAll ? "Season Total" : selectedModules.map((m) => m.name).join(" + ");
  const totalPoints = formatPoints(isAll ? target.totals.season : combinedTotal);

  return (
    <div className="h-72 overflow-y-auto overscroll-contain bg-card px-3 pb-2">
      <div className="sticky top-0 z-10 -mx-3 flex h-10 items-center gap-1.5 overflow-x-auto bg-card px-3">
        <Chip active={isAll} onClick={() => setSelected([])}>
          All
        </Chip>
        {enabledModules.map((m) => (
          <Chip key={m.key} active={selected.includes(m.key)} onClick={() => toggleModule(m.key)}>
            {m.name}
          </Chip>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          disabled={!hasBreakdown}
          aria-expanded={hasBreakdown ? totalsOpen : undefined}
          onClick={() => setTotalsOpen(!totalsOpen)}
          className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left disabled:cursor-default"
        >
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {totalLabel}
            {hasBreakdown && (
              <ChevronDownIcon className={cn("size-3.5 transition-transform", totalsOpen && "rotate-180")} />
            )}
          </span>
          <span className="font-heading text-sm font-semibold text-accent">
            {totalPoints}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">pts</span>
          </span>
        </button>
        {hasBreakdown && totalsOpen && (
          <div className="flex gap-2 border-t border-border px-3 py-1.5">
            {totalsShown.map((m) => (
              <div key={m.key} className="flex-1 text-center">
                <p className="font-heading text-xs font-semibold">{formatPoints(target.totals[m.key] ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">
                  <span aria-hidden>{m.icon}</span> {m.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>


      {!result && <p className="py-6 text-center text-sm text-muted-foreground">Loading score history…</p>}
      {result?.error && <p className="py-6 text-center text-sm text-danger-text">{result.error}</p>}
      {result?.lines && groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {isAll ? "No points earned yet." : "No points in the selected modules yet."}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.weekNumber} className="mb-1">
          <div className="sticky top-10 z-[5] flex items-center gap-2 bg-card py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <span>{formatEpisodeCasualShort(group.weekNumber)}</span>
            <span className="h-px flex-1 bg-border" />
            <span className="w-12 text-right text-[9px] text-muted-foreground">Pts</span>
            <span className="w-12 text-right text-[9px] text-muted-foreground">Total</span>
          </div>
          <ul>
            {group.rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 border-t border-border py-1.5 first:border-t-0">
                <span
                  role="img"
                  aria-label={scoringModule(row.module).name}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-xs"
                >
                  {scoringModule(row.module).icon}
                </span>
                <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug">
                  {row.label}
                  {row.result && (
                    <>
                      {" · "}
                      {row.result === HIT_MARK ? <span className="text-emerald-text">{HIT_MARK}</span> : row.result}
                    </>
                  )}
                </span>
                <span className="w-12 text-right font-heading text-xs font-semibold tabular-nums text-accent">
                  {formatSignedPoints(row.points)}
                </span>
                <span className="w-12 text-right font-heading text-[11px] tabular-nums text-muted-foreground">
                  {formatPoints(row.run)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
