import type { ReactNode } from "react";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";

export function LeagueTabs({
  leagueId,
  activeTab,
  yourPicks,
  standings,
}: {
  leagueId: string;
  activeTab: "picks" | "standings";
  yourPicks: ReactNode;
  standings: ReactNode;
}) {
  return (
    <>
      <FanBottomNav active={activeTab} leagueId={leagueId} />
      <div className={BOTTOM_NAV_CLEARANCE}>
        {activeTab === "standings" ? standings : yourPicks}
      </div>
    </>
  );
}
