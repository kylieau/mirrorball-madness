import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DeadlineStub } from "@/components/deadline-stub";
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
};

export function HomeDashboard({
  leagues,
  deadlines,
  recentActivity,
}: {
  leagues: HomeLeague[];
  deadlines: { leagueId: string; leagueName: string; moduleLabel: string; iso: string }[];
  recentActivity: string[];
}) {
  const needingPicks = leagues.filter((l) => l.picksDue).length;

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {leagues.length} league{leagues.length === 1 ? "" : "s"}
        {needingPicks > 0 ? ` · ${needingPicks} need${needingPicks === 1 ? "s" : ""} picks` : " · all caught up"}
      </p>

      {deadlines.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {deadlines.map((d) => (
            <DeadlineStub
              key={d.leagueId}
              label={`${d.leagueName} · ${d.moduleLabel}`}
              headline={`Closes in ${formatCountdown(d.iso)}`}
              ctaLabel="Make picks"
              href={`/leagues/${d.leagueId}?tab=yourpicks`}
            />
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
        <span>Your leagues</span>
        <span className="font-normal text-muted-foreground">{leagues.length}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {leagues.map((l) => (
          <Link key={l.id} href={`/leagues/${l.id}`} className="block">
            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-heading text-sm font-semibold">{l.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Rank {l.rank} of {l.totalMembers} · {l.totalPoints} pts
                  </p>
                  <div className="mt-2 flex gap-1.5 text-sm">
                    <span className={l.danceCardOn ? "opacity-100" : "opacity-30"}>🪩</span>
                    <span className={l.curtainCallOn ? "opacity-100" : "opacity-30"}>🔮</span>
                    <span className={l.grandFinaleOn ? "opacity-100" : "opacity-30"}>🏆</span>
                  </div>
                </div>
                {l.picksDue ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
                    Picks due
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    All caught up
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {recentActivity.length > 0 && (
        <>
          <div className="mb-2 mt-6 border-t border-border pt-4 text-sm font-semibold text-accent">
            Recent activity
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
        See all leagues
      </Link>
    </div>
  );
}
