"use client";

import { formatEpisodeCasual } from "@/lib/format-week";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export type RecastOverdueRun = { weekNumber: number; dueAt: string; resultsIn: boolean; leagues: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// A waiver run that is due and hasn't happened: it waits a day for the
// week's results, so whoever publishes should know the clock is running.
export function RecastOverdueNotice({ run }: { run: RecastOverdueRun }) {
  const runsAnywayAt = useFormattedDeadline(new Date(new Date(run.dueAt).getTime() + DAY_MS).toISOString());
  const leagues = run.leagues === 1 ? "1 league" : `${run.leagues} leagues`;
  return (
    <p role="status" className="rounded-lg border border-primary px-3 py-2 text-sm">
      {run.resultsIn
        ? `${formatEpisodeCasual(run.weekNumber)}'s waiver run is due in ${leagues} and should go within 15 minutes. If this stays, check the scheduled job.`
        : `Recast is waiting on ${formatEpisodeCasual(run.weekNumber)} results in ${leagues}. The waiver run goes ahead${runsAnywayAt ? ` ${runsAnywayAt}` : " a day after it was due"} either way.`}
    </p>
  );
}
