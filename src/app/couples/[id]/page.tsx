import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { CoupleHistoryView } from "@/components/couple-history-view";
import { StickyTopBar } from "@/components/top-bar";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { loadCoupleHistory } from "@/lib/couple-history-data";
import { coupleHistoryReturn } from "@/lib/couple-history-link";
import { loadViewerMemberships } from "@/lib/viewer-season-data";

export default async function CouplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const back = coupleHistoryReturn(from);
  const supabase = await createClient();
  const user = await getAuthUser();

  const [accountSettingsData, memberships] = user
    ? await Promise.all([getAccountSettingsData(supabase, user.id), loadViewerMemberships(supabase, user.id)])
    : [null, []];
  const page = await loadCoupleHistory(
    supabase,
    user && accountSettingsData ? { id: user.id, spoilerFreeMode: accountSettingsData.spoilerFreeMode } : null,
    id
  );
  if (!page) notFound();

  return (
    <div className="flex flex-col px-4">
      {user && accountSettingsData && <StickyTopBar {...accountSettingsData} email={user.email ?? ""} />}
      <div className={`flex flex-col gap-3 pt-3 ${BOTTOM_NAV_CLEARANCE}`}>
        <Link href={back.href} className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          {back.label}
        </Link>
        <CoupleHistoryView page={page} />
      </div>
      <FanBottomNav active={back.tab} leagueId={memberships[0]?.leagues?.id ?? null} />
    </div>
  );
}
