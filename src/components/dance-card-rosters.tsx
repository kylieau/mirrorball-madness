import { cn } from "cn";
import { formatPoints } from "@/lib/format-points";
import type { RosterGroup } from "@/components/league-rosters-card";

export function DanceCardRosters({ groups }: { groups: RosterGroup[] }) {
  return (
    <section id="rosters" className="mt-6 scroll-mt-4">
      <h2 className="font-heading text-lg font-semibold text-accent">
        Dance Card Rosters <span aria-hidden>·</span>{" "}
        <span className="font-sans text-xs font-normal text-muted-foreground">Judges&apos; Points</span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Tap a leaderboard row above for full score history.</p>

      <div className="mt-4 flex flex-col gap-3">
        {groups.map((group) => {
          return (
            <div
              key={group.managerId}
              className={cn(
                "overflow-hidden rounded-2xl border",
                group.isViewer ? "border-primary/70 bg-primary/5" : "border-primary/45 bg-card"
              )}
            >
              <div className={cn("flex items-center gap-3 px-3.5 py-2.5", group.isViewer ? "bg-primary/15" : "bg-muted/60")}>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    group.isViewer ? "bg-primary text-primary-foreground" : "bg-primary/20 text-accent"
                  )}
                >
                  {group.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-semibold">{group.displayName}</span>
                {group.isViewer && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    You
                  </span>
                )}
              </div>
              <ul className="mx-3.5 divide-y divide-border">
                {group.couples.map((couple) => (
                  <li
                    key={couple.coupleId}
                    className={cn("flex items-center justify-between gap-2 py-2.5", couple.eliminated && "opacity-50")}
                  >
                    <span className="text-sm">
                      <strong className="font-semibold text-foreground">{couple.celebrity}</strong>{" "}
                      <span className="text-muted-foreground">&amp; {couple.pro}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {couple.eliminated && <span className="text-xs text-muted-foreground">Eliminated</span>}
                      {couple.points && (
                        <span className="font-heading text-sm font-semibold tabular-nums">
                          {formatPoints(couple.points.total)} pts
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
