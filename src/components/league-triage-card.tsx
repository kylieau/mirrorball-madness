import Link from "next/link";
import { CrownIcon, LockIcon, SettingsIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeagueStatusPill } from "@/components/league-status-pill";
import { formatCountdown } from "@/lib/format-countdown";
import { formatPoints } from "@/lib/format-points";
import { scoringModule } from "@/lib/scoring-modules";
import { buildModuleStack, leagueTapHref, picksAction, type ModuleStackInput } from "@/lib/league-triage";

export type LeagueTriage = {
  id: string;
  name: string;
  isCommissioner: boolean;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  weeksBehind: number;
  modules: ModuleStackInput;
};

const GOLD_OUTLINE =
  "border-primary/60 bg-transparent text-accent hover:bg-primary/10 hover:text-accent dark:border-primary/60 dark:bg-transparent dark:hover:bg-primary/10";

const PICKS_LABEL = { make: "Make Picks", edit: "Edit Picks" } as const;

export function LeagueTriageCard({ league }: { league: LeagueTriage }) {
  const stack = buildModuleStack(league.modules);
  const action = picksAction(league.picksDue, league.modules);
  return (
    <Card className={cn("ring-primary/40", league.picksDue && "border-l-[3px] border-l-primary")}>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 font-heading text-base font-semibold">
              {league.isCommissioner && <CrownIcon className="size-3.5 shrink-0 text-primary" aria-hidden />}
              <span className="truncate">{league.name}</span>
            </p>
            <LeagueStatusPill picksDue={league.picksDue} weeksBehind={league.weeksBehind} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rank {league.rank} of {league.totalMembers} ·{" "}
            <span className="font-heading font-semibold">{formatPoints(league.totalPoints)}</span> pts
          </p>
        </div>

        {stack.length > 0 && (
          <dl className="flex flex-col gap-1.5 border-y border-border py-3 text-sm">
            {stack.map((line) => (
              <div key={line.key} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-0">
                <dt className="whitespace-nowrap text-[13px] text-muted-foreground">
                  <span aria-hidden>{scoringModule(line.key).icon}</span> {line.name}
                </dt>
                <dd className="flex min-w-0 items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "min-w-0",
                      line.tone === "needed" && "font-semibold text-accent",
                      line.tone === "normal" && "text-foreground",
                      line.tone === "dim" && "text-muted-foreground"
                    )}
                  >
                    {line.text}
                    {line.needText && (
                      <>
                        , <span className="font-semibold text-accent">{line.needText}</span>
                      </>
                    )}
                  </span>
                  {line.locked && <span className="shrink-0 text-xs italic text-muted-foreground">Locked</span>}
                  {line.locksAt && (
                    <span className="shrink-0 text-xs italic text-muted-foreground">
                      Locks in {formatCountdown(line.locksAt)}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex gap-2">
          {action === "locked" && (
            <Button
              size="lg"
              className="flex-1 border-transparent bg-muted/40 text-muted-foreground disabled:opacity-100 dark:bg-muted/40"
              disabled
            >
              <LockIcon aria-hidden />
              Picks Locked
            </Button>
          )}
          {(action === "make" || action === "edit") && (
            <Button
              size="lg"
              variant={action === "make" ? "default" : "outline"}
              className={cn(
                "flex-1",
                action === "edit" && cn(GOLD_OUTLINE, "bg-primary/10 hover:bg-primary/15 dark:bg-primary/10 dark:hover:bg-primary/15")
              )}
              nativeButton={false}
              render={<Link href={leagueTapHref(league.id, true)} />}
            >
              {PICKS_LABEL[action]}
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className={cn("flex-1", GOLD_OUTLINE)}
            nativeButton={false}
            render={<Link href={leagueTapHref(league.id, false)} />}
          >
            Open Standings
          </Button>
          <Button
            size="icon-lg"
            variant="outline"
            className={GOLD_OUTLINE}
            aria-label="League settings"
            nativeButton={false}
            render={<Link href={`/leagues/${league.id}/settings?from=/leagues`} />}
          >
            <SettingsIcon aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
