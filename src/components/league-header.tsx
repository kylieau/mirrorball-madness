"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { LeagueSwitcher, type SwitcherLeague } from "@/components/league-switcher";
import { ScrollRevealBar } from "@/components/scroll-reveal-bar";
import { SlimTopBar, TopBar } from "@/components/top-bar";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
import type { AccountSettingsData } from "@/lib/account-settings-data";

export function LeagueHeader({
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
}: {
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
}) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "yourpicks";
  const title = activeTab === "standings" ? "Standings" : "Picks";
  const currentPath = `/leagues/${leagueId}?tab=${activeTab}`;
  const leagueSettingsHref = `/leagues/${leagueId}/settings?from=${encodeURIComponent(currentPath)}`;

  return (
    <>
      <TopBar
        {...accountSettingsData}
        email={viewerEmail}
        actionSlot={
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
          )
        }
      />

      <ScrollRevealBar
        bar={
          <SlimTopBar
            {...accountSettingsData}
            email={viewerEmail}
            left={
              switcherLeagues.length > 1 ? (
                <LeagueSwitcher currentLeagueId={leagueId} leagues={switcherLeagues} activeTab={activeTab} />
              ) : (
                <span className="font-heading text-lg font-semibold">{title}</span>
              )
            }
          />
        }
      >
        <PageHeader title={title}>
          {switcherLeagues.length > 1 && (
            <LeagueSwitcher currentLeagueId={leagueId} leagues={switcherLeagues} activeTab={activeTab} />
          )}
        </PageHeader>
      </ScrollRevealBar>

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
