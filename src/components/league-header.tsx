"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LeagueModulesForm } from "@/components/league-modules-form";
import { LeagueInfoSection } from "@/components/league-info-section";
import { LeagueSwitcher, type SwitcherLeague } from "@/components/league-switcher";
import { LeagueMembersSection } from "@/components/league-members-section";
import { PageHeader } from "@/components/page-header";

export function LeagueHeader({
  leagueId,
  leagueName,
  inviteCode,
  danceCardOn,
  waiversOn,
  league,
  scoringSettings,
  canEdit,
  premiereAirsAt,
  justCreated,
  scoringConfigured,
  switcherLeagues,
  members,
  viewerDisplayName,
}: ComponentProps<typeof LeagueModulesForm> & {
  leagueName: string;
  inviteCode: string;
  danceCardOn: boolean;
  waiversOn: boolean;
  justCreated: boolean;
  scoringConfigured: boolean;
  switcherLeagues: SwitcherLeague[];
  members: { userId: string; displayName: string; role: string }[];
  viewerDisplayName: string;
}) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "yourpicks";
  const title = activeTab === "standings" ? "Standings" : "Your Picks";

  return (
    <Sheet>
      <div className="flex items-start justify-between gap-4">
        <Link href="/today" className="text-xs font-medium text-muted-foreground">
          🪩 Mirrorball Madness
        </Link>
        <div className="flex gap-2">
          {danceCardOn && (
            <Button
              render={<Link href={`/leagues/${leagueId}/draft`} />}
              nativeButton={false}
              size="sm"
            >
              Draft room
            </Button>
          )}
          {danceCardOn && waiversOn && (
            <Button
              render={<Link href={`/leagues/${leagueId}/waivers`} />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              Recast
            </Button>
          )}
          <SheetTrigger render={<Button variant="outline" size="icon-sm" aria-label="League settings" />}>
            <SettingsIcon />
          </SheetTrigger>
          <Button
            render={<Link href="/settings" />}
            nativeButton={false}
            size="icon-sm"
            aria-label="Account settings"
            className="rounded-full font-bold"
          >
            {viewerDisplayName.charAt(0).toUpperCase()}
          </Button>
        </div>
      </div>

      <PageHeader title={title}>
        {switcherLeagues.length > 1 && (
          <LeagueSwitcher currentLeagueId={leagueId} leagues={switcherLeagues} activeTab={activeTab} />
        )}
      </PageHeader>

      {justCreated && canEdit && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>🎉 League created!</CardTitle>
            <CardDescription>Share this invite code with your league.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <span className="font-mono text-2xl font-bold tracking-widest">{inviteCode}</span>
            <SheetTrigger render={<Button size="sm" />}>Set league rules</SheetTrigger>
          </CardContent>
        </Card>
      )}

      {!justCreated && !scoringConfigured && canEdit && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm">Finish setting up your league&apos;s scoring rules.</p>
            <SheetTrigger render={<Button size="sm" />}>Review Settings</SheetTrigger>
          </CardContent>
        </Card>
      )}

      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>League Settings</SheetTitle>
          <SheetDescription>
            {canEdit
              ? "Modules, Scoring Mix, and per-category rules for this league."
              : "View-only — only the commissioner can change these."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-4">
          <LeagueMembersSection leagueId={leagueId} members={members} canEdit={canEdit} />
          <LeagueInfoSection
            leagueId={leagueId}
            leagueName={leagueName}
            inviteCode={inviteCode}
            canEdit={canEdit}
          />
          <LeagueModulesForm
            leagueId={leagueId}
            league={league}
            scoringSettings={scoringSettings}
            canEdit={canEdit}
            premiereAirsAt={premiereAirsAt}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
