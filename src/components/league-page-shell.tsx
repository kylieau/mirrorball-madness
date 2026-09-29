import type { ReactNode } from "react";
import { cn } from "cn";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { LeagueHeader, type LeagueTab } from "@/components/league-header";
import { RevealAutoRefresh } from "@/components/reveal-auto-refresh";
import { LiveScoresPrompt } from "@/components/live-scores-prompt";
import type { LeaguePageBase } from "@/lib/league-page-data";

export function LeaguePageShell({
  tab,
  base,
  error,
  message,
  justCreated,
  children,
}: {
  tab: LeagueTab;
  base: LeaguePageBase;
  error?: string;
  message?: string;
  justCreated?: string;
  children: ReactNode;
}) {
  const { league, scoringSettings, spoilerFreeStrip } = base;
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4">
      <div className={cn("flex flex-col gap-4", spoilerFreeStrip ? "pt-4" : "py-8")}>
        <LeagueHeader
          tab={tab}
          leagueId={league.id}
          inviteCode={league.invite_code}
          danceCardOn={base.danceCardOn}
          waiversOn={base.waiversOn}
          canEdit={base.isCommissioner}
          justCreated={justCreated === "1"}
          scoringConfigured={scoringSettings?.scoring_configured ?? true}
          switcherLeagues={base.switcherLeagues}
          accountSettingsData={base.accountSettingsData}
          viewerEmail={base.user.email ?? ""}
          spoilerFreeStrip={spoilerFreeStrip}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        {base.livePrompt && (
          <LiveScoresPrompt {...base.livePrompt} spoilerFreeMode={base.accountSettingsData.spoilerFreeMode} />
        )}
        <RevealAutoRefresh active={base.revealingVisible || base.liveWindow} />
        <FanBottomNav active={tab} leagueId={league.id} />
        <div className={BOTTOM_NAV_CLEARANCE}>{children}</div>
      </div>
    </div>
  );
}
