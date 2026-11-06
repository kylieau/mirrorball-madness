import Link from "next/link";
import { cn } from "cn";
import type { CoupleHistoryPage } from "@/lib/couple-history-data";
import type { CoupleHistoryDance, CoupleHistoryWeek } from "@/lib/couple-history";
import type { CoupleLeagueRow } from "@/lib/couple-leagues";
import { YouPill } from "@/components/you-pill";
import { formatPoints } from "@/lib/format-points";
import { formatEpisodeCasual } from "@/lib/format-week";
import { fanOutcomeBadge, IN_JEOPARDY_BADGE, showInJeopardyBadge } from "@/lib/results-outcome";

const BADGE = "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold";

function statusBadge(status: string, eliminationWeek: number | null): { label: string; className: string } {
  const week = eliminationWeek !== null ? ` · ${formatEpisodeCasual(eliminationWeek)}` : "";
  if (status === "eliminated") return { label: `Eliminated${week}`, className: "bg-muted text-muted-foreground" };
  if (status === "withdrawn") return { label: `Withdrew${week}`, className: "bg-muted text-muted-foreground" };
  if (status === "winner" || status === "runner_up" || status === "third_place") return fanOutcomeBadge(status);
  return { label: "Still Dancing", className: "bg-primary/15 text-accent" };
}

function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

function nightScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function DanceRow({ dance }: { dance: CoupleHistoryDance }) {
  return (
    <div className="flex gap-3 border-t border-border/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {dance.label}
          {dance.detail && <span className="font-normal text-muted-foreground"> ({dance.detail})</span>}
        </p>
        {dance.song && <p className="text-xs text-muted-foreground">{dance.song}</p>}
        {dance.marks.length > 0 && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {dance.marks.map((mark, i) => (
              <span key={mark.judge}>
                {i > 0 && " · "}
                {mark.judge} <span className="font-semibold text-foreground">{mark.score}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      <span className={cn("shrink-0 font-heading text-base font-semibold tabular-nums", dance.bonus && "text-accent")}>
        {dance.bonus ? signed(dance.total) : dance.total}
      </span>
    </div>
  );
}

function WeekCard({ week, notes }: { week: CoupleHistoryWeek; notes: string[] }) {
  const outcome = week.outcome ? fanOutcomeBadge(week.outcome) : null;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          {formatEpisodeCasual(week.weekNumber)}
          {week.theme && <span className="font-normal text-muted-foreground"> — {week.theme}</span>}
        </h2>
        {week.mode === "scores" && <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Posting Live</span>}
        {outcome && <span className={cn(BADGE, outcome.className)}>{outcome.label}</span>}
        {week.outcome && showInJeopardyBadge(week.outcome, week.inJeopardy) && (
          <span className={cn(BADGE, IN_JEOPARDY_BADGE.className)}>{IN_JEOPARDY_BADGE.label}</span>
        )}
      </div>
      {week.nights.length === 0 && <p className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">Didn&apos;t dance</p>}
      {week.nights.map((night) => (
        <div key={night.episodeId}>
          {night.dances.map((dance) => (
            <DanceRow key={dance.id} dance={dance} />
          ))}
          {night.combined && (
            <p className="flex items-baseline justify-between border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Night</span>
              <span className="tabular-nums">
                {nightScore(night.combined.total)}/{night.combined.max} →{" "}
                <span className="font-heading text-sm font-semibold text-foreground">{night.combined.scaled.toFixed(2)}</span>
              </span>
            </p>
          )}
        </div>
      ))}
      {notes.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          {notes.map((note) => (
            <p key={note} className="text-xs text-accent">
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-muted px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function LeaguesCard({ rows }: { rows: CoupleLeagueRow[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In Your Leagues</h2>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((row) => {
          const yours = row.owner.kind === "you";
          return (
            <div key={row.leagueId} className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("min-w-0 break-words", !yours && "text-muted-foreground")}>
                {row.leagueName} ·{" "}
                {row.owner.kind === "you" ? "your roster" : row.owner.kind === "manager" ? `${row.owner.name}'s roster` : "Undrafted"}
                {yours && (
                  <>
                    {" "}
                    <YouPill />
                  </>
                )}
              </span>
              <span className={cn("shrink-0 font-heading font-semibold tabular-nums", !yours && "text-muted-foreground")}>
                {formatPoints(row.judgesPoints)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Judges&apos; points while on that roster
        {rows.some((row) => row.owner.kind === "undrafted") ? ", or what an undrafted couple would have earned since the Anchor Week." : "."}
      </p>
    </section>
  );
}

export function CoupleHistoryView({ page }: { page: CoupleHistoryPage }) {
  const { history, unwatched } = page;
  const status = statusBadge(page.status, page.eliminationWeek);
  const weekCount = history.weeks.length;
  const jeopardy = history.jeopardyWeeks;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold">
          {page.celebrity} <span className="font-medium text-muted-foreground">&amp; {page.pro}</span>
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={cn(BADGE, status.className)}>{status.label}</span>
          {weekCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {weekCount} {weekCount === 1 ? "week" : "weeks"} · {history.danceCount} {history.danceCount === 1 ? "dance" : "dances"}
            </span>
          )}
        </div>
      </div>

      {unwatched && (
        // No Mark Watched here: Results' strip is the one control, and its sheet
        // lets the viewer pick an earlier week instead of marking them all.
        <div className="rounded-2xl border border-dashed border-primary/50 px-3.5 py-3 text-sm">
          <p>
            <span className="font-semibold">
              {unwatched.from === unwatched.to ? formatEpisodeCasual(unwatched.to) : `Weeks ${unwatched.from}–${unwatched.to}`}
            </span>{" "}
            <span className="text-muted-foreground">{unwatched.from === unwatched.to ? "isn't" : "aren't"} watched yet.</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Mark {unwatched.from === unwatched.to ? "it" : "them"} watched on{" "}
            <Link href="/this-week" className="font-semibold text-accent underline-offset-2 hover:underline">
              Results
            </Link>{" "}
            to see them here.
          </p>
        </div>
      )}

      {page.live.postingWeek !== null && (
        <p className="rounded-2xl border border-dashed border-primary/50 px-3.5 py-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{formatEpisodeCasual(page.live.postingWeek)}</span> is posting live. Choose
          Stay Updated on{" "}
          <Link href="/this-week" className="font-semibold text-accent underline-offset-2 hover:underline">
            Results
          </Link>{" "}
          to follow it here.
        </p>
      )}

      {history.average !== null && history.best && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Average" value={history.average.toFixed(1)} sub="per night, of 30" />
          <Stat
            label="Best"
            value={`${nightScore(history.best.total)}/${history.best.possible}`}
            sub={`${history.best.label} · ${formatEpisodeCasual(history.best.weekNumber)}`}
          />
          <Stat
            label="In Jeopardy"
            value={`${jeopardy.length}×`}
            sub={jeopardy.length === 0 ? "Never" : `${jeopardy.length === 1 ? "Week" : "Weeks"} ${jeopardy.join(", ")}`}
          />
        </div>
      )}

      {page.leagues.length > 0 && <LeaguesCard rows={page.leagues} />}

      {history.weeks.map((week) => (
        <WeekCard key={week.weekNumber} week={week} notes={page.pickNotes[week.weekNumber] ?? []} />
      ))}
      {weekCount === 0 && !unwatched && (
        <p className="rounded-2xl border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground">
          No dances yet. Their scores fill in here once their first week is on Results.
        </p>
      )}
    </div>
  );
}
