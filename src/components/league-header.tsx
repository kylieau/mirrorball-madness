"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeagueSwitcher, type SwitcherLeague } from "@/components/league-switcher";
import { FanPageChrome } from "@/components/top-bar";
import { SpoilerFreeStrip, type SpoilerFreeStripState } from "@/components/spoiler-free-strip";
import { DraftScoresStrip } from "@/components/draft-scores-strip";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
import type { AccountSettingsData } from "@/lib/account-settings-data";

export type LeagueTab = "picks" | "standings";

export function LeagueHeader({
  tab,
  leagueId,
  canEdit,
  inviteCode,
  justCreated,
  scoringConfigured,
  switcherLeagues,
  switcherCurrent,
  accountSettingsData,
  viewerEmail,
  spoilerFreeStrip,
  draftScoresStrip,
}: {
  tab: LeagueTab;
  leagueId: string;
  canEdit: boolean;
  inviteCode: string;
  justCreated: boolean;
  scoringConfigured: boolean;
  switcherLeagues: SwitcherLeague[];
  switcherCurrent: { rank: number; totalMembers: number };
  accountSettingsData: AccountSettingsData;
  viewerEmail: string;
  // Same strip as Home/Results, pinned under the title row, matching Home exactly.
  spoilerFreeStrip: SpoilerFreeStripState | null;
  // Unlocked drafts: the amber strip replaces the Spoiler-Free one, as on Home.
  draftScoresStrip: boolean;
}) {
  const title = tab === "standings" ? "Standings" : "Picks";
  const currentPath = `/leagues/${leagueId}/${tab}`;
  const leagueSettingsHref = `/leagues/${leagueId}/settings?from=${encodeURIComponent(currentPath)}`;

  return (
    <>
      <FanPageChrome
        {...accountSettingsData}
        email={viewerEmail}
        title={title}
        trailing={
          switcherLeagues.length > 1 ? (
            <LeagueSwitcher
              currentLeagueId={leagueId}
              leagues={switcherLeagues}
              currentStanding={switcherCurrent}
              tab={tab}
            />
          ) : (
            <p className="truncate text-sm font-medium text-muted-foreground">
              {switcherLeagues.find((l) => l.id === leagueId)?.name}
            </p>
          )
        }
        strip={
          draftScoresStrip ? (
            <DraftScoresStrip />
          ) : spoilerFreeStrip ? (
            <SpoilerFreeStrip
              key={`${spoilerFreeStrip.kind}-${spoilerFreeStrip.weekNumber}-${"earlierWeeks" in spoilerFreeStrip ? spoilerFreeStrip.earlierWeeks.join() : ""}`}
              state={spoilerFreeStrip}
            />
          ) : null
        }
      />

      {justCreated && canEdit && (
        <Card className="mt-3 border-primary">
          <CardHeader>
            <CardTitle>🎉 League created!</CardTitle>
            <CardDescription>Share this invite code with your league.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-2xl font-bold tracking-widest">{inviteCode}</span>
              <Button render={<Link href={leagueSettingsHref} />} nativeButton={false} size="sm">
                Set League Rules
              </Button>
            </div>
            <CopyInviteLinkButton inviteCode={inviteCode} />
          </CardContent>
        </Card>
      )}

      {!justCreated && !scoringConfigured && canEdit && (
        <Card className="mt-3 border-primary">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm">Finish setting up your league&apos;s scoring rules.</p>
            <Button render={<Link href={leagueSettingsHref} />} nativeButton={false} size="sm">
              Review Settings
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
