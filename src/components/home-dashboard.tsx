import { formatPoints } from "@/lib/format-points";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { DeadlineStub } from "@/components/deadline-stub";
import { EpisodeBanner } from "@/components/episode-banner";
import { SpoilerRevealCallout } from "@/components/spoiler-reveal-callout";
import type { EpisodeBannerState } from "@/lib/episode-banner";
import { formatCountdown } from "@/lib/format-countdown";

type HomeLeague = {
  id: string;
  name: string;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  danceCardOn: boolean;
  curtainCallOn: boolean;
  grandFinaleOn: boolean;
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
  recentActivity: string[];
  pendingReveal: { weekNumber: number } | null;
  episodeBanner: { state: EpisodeBannerState; weeksDone: number } | null;
}) {
  const needingPicks = leagues.filter((l) => l.picksDue).length;

  return (
    <div>
      {episodeBanner && <EpisodeBanner state={episodeBanner.state} weeksDone={episodeBanner.weeksDone} />}

      <p className="mb-4 text-sm text-muted-foreground">
        {leagues.length} league{leagues.length === 1 ? "" : "s"}
        {needingPicks > 0 ? ` · ${needingPicks} need${needingPicks === 1 ? "s" : ""} picks` : " · all caught up"}
      </p>

      {pendingReveal && <SpoilerRevealCallout weekNumber={pendingReveal.weekNumber} />}

      {deadlines.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {deadlines.map((d) => (
            <DeadlineStub
              key={d.leagueId}
              label={d.leagueName}
              headline={`Closes in ${formatCountdown(d.iso)}`}
              ctaLabel="Make picks"
              href={`/leagues/${d.leagueId}?tab=yourpicks`}
            />
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
        <span>Your Leagues</span>
        <span className="font-normal text-muted-foreground">{leagues.length}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {leagues.map((l) => (
          <Card key={l.id}>
            <CardContent className="flex items-start justify-between gap-3 py-4">
              <Link href={`/leagues/${l.id}?tab=standings`} className="flex-1">
                <p className="font-heading text-sm font-semibold">{l.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rank {l.rank} of {l.totalMembers} · {formatPoints(l.totalPoints)} pts
                </p>
                <div className="mt-2 flex gap-1.5 text-sm">
                  <span className={l.danceCardOn ? "opacity-100" : "opacity-30"}>🪩</span>
                  <span className={l.curtainCallOn ? "opacity-100" : "opacity-30"}>🔮</span>
                  <span className={l.grandFinaleOn ? "opacity-100" : "opacity-30"}>🏆</span>
                </div>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {l.picksDue ? (
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
                    Picks Due
                  </span>
                ) : l.weeksBehind > 0 ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    {l.weeksBehind} wk behind
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    All caught up
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-3">
        <CreateJoinLeagueDialogs />
      </div>

      {recentActivity.length > 0 && (
        <>
          <div className="mb-2 mt-6 border-t border-border pt-4 text-sm font-semibold text-accent">
            Recent Activity
          </div>
          <Card>
            <CardContent className="flex flex-col py-2">
              {recentActivity.map((line, i) => (
                <p
                  key={i}
                  className="border-t border-border py-2.5 text-sm text-muted-foreground first:border-t-0"
                >
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Link
        href="/leagues"
        className="mt-3 block rounded-xl border border-border py-3 text-center text-sm font-semibold text-accent"
      >
        See All Leagues
      </Link>
    </div>
  );
}
