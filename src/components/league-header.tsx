"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { LeagueSwitcher, type SwitcherLeague } from "@/components/league-switcher";
import { ScrollRevealBar } from "@/components/scroll-reveal-bar";
import { SlimTopBar, TopBar } from "@/components/top-bar";
import { HomeSpoilerChrome, type SpoilerFreeStripState } from "@/components/spoiler-free-strip";
import { HomeDraftChrome } from "@/components/draft-scores-strip";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
import type { AccountSettingsData } from "@/lib/account-settings-data";

export type LeagueTab = "picks" | "standings";

export function LeagueHeader({
  tab,
  leagueId,
  danceCardOn,
  waiversOn,
  canEdit,
  inviteCode,
  justCreated,
  scoringConfigured,
  switcherLeagues,
  accountSettingsData,
  viewerEmail,
  spoilerFreeStrip,
  draftScoresStrip,
}: {
  tab: LeagueTab;
  leagueId: string;
  danceCardOn: boolean;
  waiversOn: boolean;
  canEdit: boolean;
  inviteCode: string;
  justCreated: boolean;
  scoringConfigured: boolean;
  switcherLeagues: SwitcherLeague[];
  accountSettingsData: AccountSettingsData;
  viewerEmail: string;
  // Same strip as Home/Results; when present it takes over as the sticky
  // chrome (wordmark + avatar + strip) and the scroll-triggered compact bar
  // is skipped — one sticky mechanism at a time, matching Home exactly.
  spoilerFreeStrip: SpoilerFreeStripState | null;
  // Unlocked drafts: the amber strip replaces the Spoiler-Free one, as on Home.
  draftScoresStrip: boolean;
}) {
  const title = tab === "standings" ? "Standings" : "Picks";
  const currentPath = `/leagues/${leagueId}/${tab}`;
  const leagueSettingsHref = `/leagues/${leagueId}/settings?from=${encodeURIComponent(currentPath)}`;

  const recastAction =
    danceCardOn &&
    waiversOn && (
      <Button
        render={<Link href={`/leagues/${leagueId}/waivers`} />}
        nativeButton={false}
        variant="outline"
        size="sm"
      >
        Recast
      </Button>
    );

  const pageHeader = (
    <PageHeader title={title}>
      {switcherLeagues.length > 1 && (
        <LeagueSwitcher currentLeagueId={leagueId} leagues={switcherLeagues} tab={tab} />
      )}
    </PageHeader>
  );

  return (
    <>
      {draftScoresStrip ? (
        <>
          <HomeDraftChrome {...accountSettingsData} email={viewerEmail} actionSlot={recastAction} />
          {pageHeader}
        </>
      ) : spoilerFreeStrip ? (
        <>
          <HomeSpoilerChrome
            key={`${spoilerFreeStrip.kind}-${spoilerFreeStrip.weekNumber}-${"earlierWeeks" in spoilerFreeStrip ? spoilerFreeStrip.earlierWeeks.join() : ""}`}
            {...accountSettingsData}
            email={viewerEmail}
            state={spoilerFreeStrip}
            actionSlot={recastAction}
          />
          {pageHeader}
        </>
      ) : (
        <>
          <TopBar {...accountSettingsData} email={viewerEmail} actionSlot={recastAction} />
          <ScrollRevealBar
            bar={
              <SlimTopBar
                {...accountSettingsData}
                email={viewerEmail}
                left={
                  switcherLeagues.length > 1 ? (
                    <LeagueSwitcher currentLeagueId={leagueId} leagues={switcherLeagues} tab={tab} />
                  ) : (
                    <span className="font-heading text-lg font-semibold">{title}</span>
                  )
                }
              />
            }
          >
            {pageHeader}
          </ScrollRevealBar>
        </>
      )}

      {justCreated && canEdit && (
        <Card className="border-primary">
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
        <Card className="border-primary">
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
