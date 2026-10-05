import { ScrollFade } from "@/components/scroll-fade";
import { cn } from "cn";
import { YouPill } from "@/components/you-pill";
import { formatPoints } from "@/lib/format-points";

export type CoupleLeaderboardRow = {
  coupleId: string;
  celebrity: string;
  pro: string;
  ownerName: string | null;
  isViewer: boolean;
  eliminated: boolean;
  judgesPoints: number;
  bonusPoints: number;
  totalPoints: number;
};

// Number columns are sized for two-digit points so the name column keeps
// enough room at 360px for a couple's first names on one line.
const COLUMNS = "grid grid-cols-[1rem_minmax(0,1fr)_2.5rem_3rem_3.5rem] items-center gap-x-1.5";

export function CouplesLeaderboard({ rows }: { rows: CoupleLeaderboardRow[] }) {
  return (
    <section id="couples" className="mt-6 scroll-mt-4">
      <h2 className="font-heading text-lg font-semibold text-accent">Couples Leaderboard</h2>

      <ScrollFade
        outerClassName="mt-3 overflow-hidden rounded-2xl border border-primary/45 bg-card"
        className="h-96 overscroll-contain"
      >
        <div
          className={cn(
            COLUMNS,
            "sticky top-0 z-10 bg-muted px-3.5 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
          )}
        >
          <span className="col-span-2" />
          <span className="text-right">Judges</span>
          <span className="text-right">Bonuses</span>
          <span className="text-right">Total</span>
        </div>
        <ol className="divide-y divide-border">
          {rows.map((row, i) => {
            const undrafted = row.ownerName === null;
            return (
              <li
                key={row.coupleId}
                className={cn(
                  COLUMNS,
                  "relative px-3.5 py-2.5",
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
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{undrafted ? "Undrafted" : row.ownerName}</span>
                    {row.isViewer && <YouPill />}
                  </span>
                </span>
                <span
                  className={cn("text-right font-heading text-sm font-semibold tabular-nums text-muted-foreground", undrafted && "italic")}
                >
                  {formatPoints(row.judgesPoints)}
                </span>
                <span
                  className={cn("text-right font-heading text-sm font-semibold tabular-nums text-muted-foreground", undrafted && "italic")}
                >
                  {formatPoints(row.bonusPoints)}
                </span>
                <span
                  className={cn(
                    "border-l border-border pl-2 text-right font-heading text-base font-semibold tabular-nums",
                    undrafted && "italic"
                  )}
                >
                  {formatPoints(row.totalPoints)}
                </span>
              </li>
            );
          })}
        </ol>
      </ScrollFade>
    </section>
  );
}
