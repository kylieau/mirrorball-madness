import { formatEpisodeCasual } from "@/lib/format-week";

export type RecastOverdueRun = { weekNumber: number; leagues: number };

// A waiver run that came due (48 hours after its week's results were posted)
// and hasn't happened: the scheduled job should have picked it up.
export function RecastOverdueNotice({ run }: { run: RecastOverdueRun }) {
  const leagues = run.leagues === 1 ? "1 league" : `${run.leagues} leagues`;
  return (
    <p role="status" className="rounded-lg border border-primary px-3 py-2 text-sm">
      {formatEpisodeCasual(run.weekNumber)}&apos;s waiver run is due in {leagues} and should go within 15 minutes. If this stays, check
      the scheduled job.
    </p>
  );
}
