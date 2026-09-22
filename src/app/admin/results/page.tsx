import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResultsScreen } from "@/components/results-screen";
import { userIsAnyLeagueCommissioner } from "@/lib/results";
import { loadResultsPageData } from "@/lib/results-page-data";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";

export default async function AdminResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accountSettingsData = await getAccountSettingsData(supabase, user.id);

  // No access gate beyond being signed in — the view tier is open to everyone
  // so anyone can see how scores and outcomes get entered. What a viewer can
  // *do* is decided per-tab below and re-checked server-side in actions.ts.
  const canPropose =
    accountSettingsData.isSuperAdmin ||
    (await userIsAnyLeagueCommissioner(createAdminClient(), user.id));

  const data = await loadResultsPageData(supabase, createAdminClient());

  return (
    <ResultsScreen
      accountSettingsData={accountSettingsData}
      viewerEmail={user.email ?? ""}
      canPropose={canPropose}
      activeCouples={data.activeCouples}
      allCouples={data.allCouples}
      allCouplesWithStatus={data.allCouplesWithStatus}
      activeCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(data.activeCouples))}
      allCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(data.allCouples))}
      judges={data.judges}
      danceStyles={data.danceStyles}
      episodes={data.episodes}
      weeks={data.weeks}
      danceScores={data.danceScores}
      judgeScores={data.judgeScores}
      episodeResults={data.episodeResults}
      draftsByEpisode={data.draftsByEpisode}
      publishedByNames={data.publishedByNames}
      season={data.season}
      participantsByEpisode={data.participantsByEpisode}
    />
  );
}
