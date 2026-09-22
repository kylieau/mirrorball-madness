import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { loadResultsPageData } from "@/lib/results-page-data";
import { ScheduleManager } from "@/components/schedule-manager";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accountSettingsData = await getAccountSettingsData(supabase, user.id);

  // View tier is open to everyone, same as Results — anyone can see what's
  // scheduled and when; only is_super_admin can edit it (readOnly below).
  const data = await loadResultsPageData(supabase, createAdminClient());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />
      <PageHeader title="Schedule" />
      <ScheduleManager
        readOnly={!accountSettingsData.isSuperAdmin}
        episodes={data.episodes}
        weeks={data.weeks}
        episodeResults={data.episodeResults}
        draftsByEpisode={data.draftsByEpisode}
        season={data.season}
        seasonCouples={data.allCouplesWithStatus}
        participantsByEpisode={data.participantsByEpisode}
      />
    </div>
  );
}
