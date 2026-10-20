import { redirect } from "next/navigation";
import { cn } from "cn";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { GuestSignInCard } from "@/components/guest-sign-in-card";
import { PageHeader } from "@/components/page-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { loadViewerMemberships } from "@/lib/viewer-season-data";

// /picks and /standings are the league-less tab targets. A signed-in viewer is
// sent on to that tab of their first league (or to Manage Leagues with none);
// a guest gets a sign-in prompt in the normal tab frame.
export async function GuestTabPage({
  tab,
  title,
  description,
}: {
  tab: "picks" | "standings";
  title: string;
  description: string;
}) {
  const user = await getAuthUser();
  if (user) {
    const memberships = await loadViewerMemberships(await createClient(), user.id);
    const firstLeagueId = memberships.find((m) => m.leagues)?.leagues?.id;
    redirect(firstLeagueId ? `/leagues/${firstLeagueId}/${tab}` : "/leagues");
  }

  return (
    <div className="flex flex-col px-4">
      <div className={cn("flex flex-col gap-3 pt-3", BOTTOM_NAV_CLEARANCE)}>
        <PageHeader title={title} />
        <GuestSignInCard title={`Sign In to See ${title}`} description={description} />
      </div>
      <FanBottomNav active={tab} leagueId={null} />
    </div>
  );
}
