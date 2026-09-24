import { formatPoints } from "@/lib/format-points";
import Link from "next/link";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { DeadlineStub } from "@/components/deadline-stub";
import { EpisodeBanner } from "@/components/episode-banner";
import { SpoilerRevealCallout } from "@/components/spoiler-reveal-callout";
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
  pendingReveal,
  episodeBanner,
}: {
  leagues: HomeLeague[];
  deadlines: { leagueId: string; leagueName: string; iso: string }[];
  recentActivity: ActivityLine[];
  pendingReveal: { weekNumber: number; inProgress?: boolean } | null;
  episodeBanner: { input: EpisodeBannerInput; initialState: EpisodeBannerState | null };
}) {
  // Picks-due leagues lead so the cap never hides the one that needs attention.
  const shownLeagues = [...leagues].sort((a, b) => Number(b.picksDue) - Number(a.picksDue)).slice(0, MAX_LEAGUES_SHOWN);
  const needingPicks = leagues.filter((l) => l.picksDue).length;
  const sharedCountdown = deadlines[0] ? formatCountdown(deadlines[0].iso) : "";

  return (
    <div>
      <EpisodeBanner {...episodeBanner} />

      <p className="mb-4 text-sm text-muted-foreground">
        {leagues.length} league{leagues.length === 1 ? "" : "s"}
        {needingPicks > 0 ? ` · ${needingPicks} need${needingPicks === 1 ? "s" : ""} picks` : " · all caught up"}
      </p>

      {pendingReveal && <SpoilerRevealCallout weekNumber={pendingReveal.weekNumber} inProgress={pendingReveal.inProgress} />}

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

      <div className="mb-2 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
        <span>
          Your Leagues <span className="font-normal text-muted-foreground">({leagues.length})</span>
        </span>
        <Link href="/leagues" className="font-normal text-muted-foreground">
          See All ›
        </Link>
      </div>
      <Card>
        <CardContent className="flex flex-col py-0">
          {shownLeagues.map((l) => (
            <Link
              key={l.id}
              href={`/leagues/${l.id}?tab=standings`}
              className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-semibold">{l.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rank {l.rank} of {l.totalMembers} ·{" "}
                  <span className="font-heading font-semibold">{formatPoints(l.totalPoints)}</span> pts
                </p>
              </div>
              {l.picksDue ? (
                <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
                  Picks Due
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {l.weeksBehind > 0 ? `${l.weeksBehind} wk behind` : "All caught up"}
                </span>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="mt-3">
        <CreateJoinLeagueDialogs quiet />
      </div>

      {recentActivity.length > 0 && (
        <>
          <div className="mb-2 mt-6 border-t border-border pt-4 text-sm font-semibold text-accent">
            Recent Activity
          </div>
          <Card>
            <CardContent className="flex h-72 flex-col overflow-y-auto py-2">
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
