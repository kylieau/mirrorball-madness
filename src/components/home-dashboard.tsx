import { formatPoints } from "@/lib/format-points";
import Link from "next/link";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { DeadlineStub } from "@/components/deadline-stub";
import { EpisodeBanner } from "@/components/episode-banner";
import { LiveScoresPrompt } from "@/components/live-scores-prompt";
import { LeagueStatusPill } from "@/components/league-status-pill";
import { leagueTapHref } from "@/lib/league-triage";
import { ScrollFade } from "@/components/scroll-fade";
import { SpoilerFreeStrip, type SpoilerFreeStripState } from "@/components/spoiler-free-strip";
import type { EpisodeBannerInput, EpisodeBannerState } from "@/lib/episode-banner";
import type { ActivityLine } from "@/lib/home-activity";
import { formatCountdown } from "@/lib/format-countdown";

const MAX_LEAGUES_SHOWN = 4;

type HomeLeague = {
  id: string;
  name: string;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  weeksBehind: number;
};

export function HomeDashboard({
  leagues,
  deadlines,
  recentActivity,
  spoilerFreeStrip,
  episodeBanner,
}: {
  leagues: HomeLeague[];
  deadlines: { leagueId: string; leagueName: string; iso: string }[];
  recentActivity: ActivityLine[];
  spoilerFreeStrip: SpoilerFreeStripState | null;
  episodeBanner: { input: EpisodeBannerInput; initialState: EpisodeBannerState | null };
}) {
  // Picks-due leagues lead so the cap never hides the one that needs attention.
  const shownLeagues = [...leagues].sort((a, b) => Number(b.picksDue) - Number(a.picksDue)).slice(0, MAX_LEAGUES_SHOWN);
  const needingPicks = leagues.filter((l) => l.picksDue).length;
  const leagueSummary =
    needingPicks > 0
      ? `${needingPicks} of ${leagues.length} need${needingPicks === 1 ? "s" : ""} picks`
      : "all caught up";
  const sharedCountdown = deadlines[0] ? formatCountdown(deadlines[0].iso) : "";

  return (
    <div>
      {spoilerFreeStrip && (
        <>
          {spoilerFreeStrip.kind === "posting" && (
            <LiveScoresPrompt weekNumber={spoilerFreeStrip.weekNumber} earlierWeeks={spoilerFreeStrip.earlierWeeks} />
          )}
          <SpoilerFreeStrip
            key={`${spoilerFreeStrip.kind}-${spoilerFreeStrip.weekNumber}-${"earlierWeeks" in spoilerFreeStrip ? spoilerFreeStrip.earlierWeeks.join() : ""}`}
            state={spoilerFreeStrip}
          />
        </>
      )}

      <EpisodeBanner {...episodeBanner} />

      {deadlines.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 font-heading text-base font-semibold">Picks close in {sharedCountdown}</p>
          <div className="grid grid-cols-2 gap-2.5">
            {deadlines.map((d) => {
              const countdown = formatCountdown(d.iso);
              return (
                <DeadlineStub
                  key={d.leagueId}
                  label={d.leagueName}
                  note={countdown === sharedCountdown ? undefined : countdown}
                  ctaLabel="Make picks"
                  href={`/leagues/${d.leagueId}?tab=yourpicks`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between border-t border-border pr-4 pt-4 text-sm font-semibold text-accent">
        <span className="min-w-0 truncate">
          Leagues This Week <span className="font-normal text-muted-foreground">• {leagueSummary}</span>
        </span>
        <Link href="/leagues" className="shrink-0 pl-3 font-normal text-muted-foreground">
          Manage ›
        </Link>
      </div>
      <Card className="py-0">
        <CardContent className="flex flex-col px-4">
          {shownLeagues.map((l) => (
            <Link
              key={l.id}
              href={leagueTapHref(l.id, l.picksDue)}
              className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-semibold">{l.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rank {l.rank} of {l.totalMembers} ·{" "}
                  <span className="font-heading font-semibold">{formatPoints(l.totalPoints)}</span> pts
                </p>
              </div>
              <LeagueStatusPill picksDue={l.picksDue} weeksBehind={l.weeksBehind} />
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="mt-3">
        <CreateJoinLeagueDialogs />
      </div>

      {recentActivity.length > 0 && (
        <>
          <div className="mb-2 mt-6 border-t border-border pt-4 text-sm font-semibold text-accent">
            Recent Activity
          </div>
          <Card className="py-0">
            <ScrollFade className="flex h-72 flex-col px-4">
              {recentActivity.map((line) => (
                <p
                  key={line.key}
                  className="flex items-baseline justify-between gap-3 border-t border-border py-2.5 text-sm text-muted-foreground first:border-t-0"
                >
                  <span>
                    {line.segments.map((seg, i) => (
                      <span
                        key={i}
                        className={cn(
                          seg.kind === "couple" && "font-semibold text-accent/92",
                          seg.kind === "manager" && "font-medium text-foreground",
                          seg.kind === "league" && "italic text-foreground/70",
                          seg.kind === "score" && "font-heading font-semibold text-foreground"
                        )}
                      >
                        {seg.text}
                      </span>
                    ))}
                  </span>
                  {line.weekLabel && <span className="shrink-0 text-xs">{line.weekLabel}</span>}
                </p>
              ))}
            </ScrollFade>
          </Card>
        </>
      )}
    </div>
  );
}
