import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEpisodeCasual } from "@/lib/format-week";
import { ordinal } from "@/lib/ordinal";

type Stat = { value: string; label: string };

// Picks once the season is over: the Curtain Call carousel's last page,
// after the Finale's week. Every figure is a stored total or a count of
// picks, never a re-score.
export function SeasonRecap({
  finaleHref,
  finaleWeekNumber,
  stats,
  bracket,
}: {
  finaleHref: string | null;
  finaleWeekNumber: number | null;
  stats: Stat[];
  bracket: { coupleId: string; name: string; place: number; predictedPlace: number | null }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 text-sm">
            {finaleHref && finaleWeekNumber != null ? (
              <Link href={finaleHref} className="flex min-h-11 items-center gap-1 text-muted-foreground hover:text-accent">
                <ChevronLeftIcon className="size-4" aria-hidden />
                {formatEpisodeCasual(finaleWeekNumber)}
              </Link>
            ) : (
              <span />
            )}
            <span className="font-semibold">Season Recap</span>
            <ChevronRightIcon className="size-4 opacity-30" aria-hidden />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Picks are closed for the season. Here&apos;s how yours went.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border px-3 py-2">
                <p className="font-heading text-xl font-semibold">{s.value}</p>
                <p className="text-[11.5px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {bracket.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Season Bracket, Graded</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {bracket.map((row) => {
                const off = row.predictedPlace == null ? null : Math.abs(row.predictedPlace - row.place);
                return (
                  <li key={row.coupleId} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 border-t border-border py-1.5 text-sm first:border-t-0">
                    <span className="font-rank font-bold">{ordinal(row.place)}</span>
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className={off === 0 ? "text-xs text-emerald-text" : "text-xs text-muted-foreground"}>
                      {row.predictedPlace == null ? "Not in your bracket" : off === 0 ? "Exact ✓" : `You had ${ordinal(row.predictedPlace)} · Off ${off}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
