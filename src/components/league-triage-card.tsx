import Link from "next/link";
import { CircleCheckIcon, CircleDashedIcon, CrownIcon, HourglassIcon, SettingsIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeagueStatusPill } from "@/components/league-status-pill";
import { coupleHistoryHref } from "@/lib/couple-history-link";
import { formatCountdown } from "@/lib/format-countdown";
import { formatPoints } from "@/lib/format-points";
import { scoringModule } from "@/lib/scoring-modules";
import {
  buildModuleStack,
  leagueTapHref,
  picksAction,
  picksButtonLabel,
  showHybridStatusPill,
  type ModuleStackInput,
  type MoveRow,
  type StackRow,
} from "@/lib/league-triage";

export type LeagueTriage = {
  id: string;
  name: string;
  isCommissioner: boolean;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  weeksBehind: number;
  // The page the card sits on, which League Settings and couple pages link back to.
  from?: string;
  modules: ModuleStackInput;
};

const GOLD_OUTLINE =
  "border-primary/60 bg-transparent text-accent hover:bg-primary/10 hover:text-accent dark:border-primary/60 dark:bg-transparent dark:hover:bg-primary/10";

export function LeagueTriageCard({ league }: { league: LeagueTriage }) {
  const stack = buildModuleStack(league.modules);
  const action = picksAction(league.picksDue, league.modules);
  const picksLabel = picksButtonLabel(action);
  const standingsPrimary = action === "locked";
  const from = league.from ?? "/leagues";
  return (
    <Card className={cn("ring-primary/40", league.picksDue && "border-l-[3px] border-l-primary")}>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 font-heading text-base font-semibold">
              {league.isCommissioner && <CrownIcon className="size-3.5 shrink-0 text-primary" aria-hidden />}
              <span className="truncate">{league.name}</span>
            </p>
            {showHybridStatusPill(league.picksDue, league.weeksBehind) && (
              <LeagueStatusPill picksDue={league.picksDue} weeksBehind={league.weeksBehind} />
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rank {league.rank} of {league.totalMembers} ·{" "}
            <span className="font-heading font-semibold">{formatPoints(league.totalPoints)}</span> pts
          </p>
        </div>

        {stack.length > 0 && (
          <dl className="flex flex-col gap-1.5 border-y border-border py-2 text-sm">
            {stack.map((line) => {
              const toneClass = cn(
                "min-w-0 break-words",
                line.tone === "needed" && "font-semibold text-accent",
                line.tone === "normal" && "text-foreground",
                line.tone === "dim" && "text-muted-foreground"
              );
              const need = line.needText && (
                <>
                  , <span className="font-semibold text-accent">{line.needText}</span>
                </>
              );
              const status = (
                <>
                  {line.locked && <span className="shrink-0 text-xs italic text-muted-foreground">Locked</span>}
                  {line.locksAt && (
                    <span className="shrink-0 text-xs italic text-muted-foreground">
                      Locks in {formatCountdown(line.locksAt)}
                    </span>
                  )}
                </>
              );
              const stacked = line.lines.length > 1 || line.moves.length > 0;
              return (
                <div
                  key={line.key}
                  className={cn("grid grid-cols-[6.5rem_1fr] gap-0", stacked ? "items-start" : "items-baseline")}
                >
                  <dt className="whitespace-nowrap text-[13px] text-muted-foreground">
                    <span aria-hidden>{scoringModule(line.key).icon}</span> {line.name}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0",
                      stacked ? "flex flex-col gap-0.5" : "flex items-baseline justify-between gap-2"
                    )}
                  >
                    {stacked ? (
                      line.lines.map((row, i) =>
                        i === 0 ? (
                          <span key={i} className="flex items-baseline justify-between gap-2">
                            <span className={cn(toneClass, "flex-1")}>
                              <StackRowText row={row} from={from} />
                              {line.lines.length === 1 && need}
                            </span>
                            {status}
                          </span>
                        ) : (
                          <span key={i} className={cn(toneClass, "block")}>
                            <StackRowText row={row} from={from} />
                            {i === line.lines.length - 1 && need}
                          </span>
                        )
                      )
                    ) : (
                      <>
                        <span className={cn(toneClass, "flex-1")}>
                          <StackRowText row={line.lines[0]} from={from} />
                          {need}
                        </span>
                        {status}
                      </>
                    )}
                    {line.moves.length > 0 && (
                      <span className="mt-1 flex flex-col gap-0.5">
                        {line.moves.map((row, i) => (
                          <MoveRowLine key={i} row={row} from={from} />
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        <div className="flex gap-2">
          {picksLabel && (
            <Button
              size="lg"
              variant={action === "make" ? "default" : "outline"}
              className={cn(
                "flex-1",
                action === "locked" && GOLD_OUTLINE,
                action === "edit" && cn(GOLD_OUTLINE, "bg-primary/10 hover:bg-primary/15 dark:bg-primary/10 dark:hover:bg-primary/15")
              )}
              nativeButton={false}
              render={<Link href={leagueTapHref(league.id, true)} />}
            >
              {picksLabel}
            </Button>
          )}
          <Button
            size="lg"
            variant={standingsPrimary ? "default" : "outline"}
            className={cn("flex-1", !standingsPrimary && GOLD_OUTLINE)}
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
            render={<Link href={`/leagues/${league.id}/settings?from=${encodeURIComponent(from)}`} />}
          >
            <SettingsIcon aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const MOVE_ICONS = {
  needed: CircleDashedIcon,
  missed: CircleDashedIcon,
  saved: CircleCheckIcon,
  waiting: HourglassIcon,
};

// A roster move under Dance Card: gold while it still needs the manager, a
// check once a Lifeline is saved, an hourglass while it waits on the waiver run.
function MoveRowLine({ row, from }: { row: MoveRow; from: string }) {
  const Icon = MOVE_ICONS[row.mark];
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span
        className={cn(
          "flex min-w-0 flex-1 gap-1.5 break-words",
          row.mark === "needed" && "font-semibold text-accent",
          row.mark === "missed" && "text-muted-foreground"
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 translate-y-0.5",
            row.mark === "saved" && "text-emerald-text",
            row.mark === "waiting" && "text-accent"
          )}
        />
        <span className="min-w-0">
          <StackRowText row={row} from={from} />
          {row.after}
        </span>
      </span>
      {row.clock && <span className="shrink-0 text-xs italic text-muted-foreground">{row.clock}</span>}
    </span>
  );
}

function StackRowText({ row, from }: { row: StackRow; from: string }) {
  return (
    <span className={cn(row.struck && "line-through")}>
      {row.text}
      {row.couple && (
        <Link href={coupleHistoryHref(row.couple.id, from)} className="hover:text-accent">
          <span className="font-semibold">{row.couple.celebrity}</span> &amp; {row.couple.pro}
        </Link>
      )}
    </span>
  );
}
