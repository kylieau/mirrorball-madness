import Link from "next/link";
import { ScrollFade } from "@/components/scroll-fade";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { cn } from "cn";
import { YouPill } from "@/components/you-pill";
import { formatPoints } from "@/lib/format-points";
import { coupleHistoryHref } from "@/lib/couple-history-link";

export type CoupleLeaderboardRow = {
  coupleId: string;
  celebrity: string;
  pro: string;
  ownerName: string | null;
  // "from Week 10" / "Weeks 8–9", when another manager has held the couple too.
  holdingLabel: string | null;
  isViewer: boolean;
  eliminated: boolean;
  judgesPoints: number;
  bonusPoints: number;
  totalPoints: number;
};

const COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem_3.25rem_4rem] items-center gap-x-2";

export function CouplesLeaderboard({ rows, historyFrom }: { rows: CoupleLeaderboardRow[]; historyFrom: string }) {
  return (
    <section id="couples" className="mt-4 scroll-mt-20">
      <ScrollToHash id="couples" />
      <h2 className="font-heading text-lg font-semibold text-accent">Couples Leaderboard</h2>

      <ScrollFade
        outerClassName="mt-3 overflow-hidden rounded-2xl border border-primary/45 bg-card"
        className="h-96 overscroll-contain"
      >
        <div
          className={cn(
            COLUMNS,
            "sticky top-0 z-10 bg-muted px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          <span className="col-span-2" />
          <span className="text-right">Judges</span>
          <span className="text-right">Bonuses</span>
          <span className="text-right">Total</span>
        </div>
        <ol className="divide-y divide-border">
          {rows.map((row, i) => (
            <li key={`${row.coupleId}:${row.ownerName ?? ""}:${row.holdingLabel ?? ""}`}>
              <Link
                href={coupleHistoryHref(row.coupleId, historyFrom)}
                className={cn(
                  COLUMNS,
                  "relative px-3.5 py-2.5 transition-colors hover:bg-muted/40",
                  row.isViewer && "bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent",
                  row.eliminated && "opacity-50"
                )}
              >
                <span
                  className={cn("text-center font-rank text-sm font-bold", row.isViewer ? "text-accent" : "text-muted-foreground")}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">
                    <strong className="font-semibold text-foreground">{row.celebrity}</strong>{" "}
                    <span className="text-muted-foreground">&amp; {row.pro}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {row.ownerName ?? "Undrafted"}
                    {row.holdingLabel && <span className="text-accent"> · {row.holdingLabel}</span>}
                    {row.isViewer && (
                      <>
                        {" "}
                        <YouPill />
                      </>
                    )}
                  </span>
                </span>
                <span className="text-right font-heading text-sm font-semibold tabular-nums text-muted-foreground">
                  {formatPoints(row.judgesPoints)}
                </span>
                <span className="text-right font-heading text-sm font-semibold tabular-nums text-muted-foreground">
                  {formatPoints(row.bonusPoints)}
                </span>
                <span className="border-l border-border pl-2 text-right font-heading text-base font-semibold tabular-nums">
                  {formatPoints(row.totalPoints)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </ScrollFade>
    </section>
  );
}
