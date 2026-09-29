import Link from "next/link";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { CreateJoinLeagueDialogs } from "@/components/create-join-league-dialogs";
import { EpisodeBanner } from "@/components/episode-banner";
import { LeagueTriageCard, type LeagueTriage } from "@/components/league-triage-card";
import { ScrollFade } from "@/components/scroll-fade";
import type { EpisodeBannerInput, EpisodeBannerState } from "@/lib/episode-banner";
import type { ActivityLine } from "@/lib/home-activity";
import { homeLeagueChrome } from "@/lib/league-triage";

export function HomeDashboard({
  leagues,
  recentActivity,
  episodeBanner,
}: {
  leagues: LeagueTriage[];
  recentActivity: ActivityLine[];
  episodeBanner: { input: EpisodeBannerInput; initialState: EpisodeBannerState | null };
}) {
  const shownLeagues = [...leagues].sort((a, b) => Number(b.picksDue) - Number(a.picksDue));
  const chrome = homeLeagueChrome(shownLeagues.length);

  return (
    <div>
      <EpisodeBanner {...episodeBanner} />

      <div className="mb-2 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
        <span>Your Leagues</span>
        {chrome.showManage && (
          <Link href="/leagues" className="shrink-0 pl-3 font-normal text-muted-foreground">
            Manage ›
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {shownLeagues.map((league) => (
          <LeagueTriageCard key={league.id} league={league} />
        ))}
      </div>

      {chrome.quietCreateJoin && (
        <div className="mt-3">
          <CreateJoinLeagueDialogs quiet />
        </div>
      )}

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
