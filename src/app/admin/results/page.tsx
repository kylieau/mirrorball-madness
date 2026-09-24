import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResultsScreen } from "@/components/results-screen";
import { userIsAnyLeagueCommissioner } from "@/lib/results";
import { loadResultsPageData } from "@/lib/results-page-data";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { groupEpisodesByWeek } from "@/lib/competition-week";

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

  // Scores' View tier being open to any signed-in user is about access, not
  // about overriding the viewer's own spoiler preference — apply the same
  // cutoff This Week uses, for every viewer regardless of role. Enter
  // Results (a separate tab/component) stays unguarded, since correcting a
  // week requires seeing it.
  const groupedWeeks = groupEpisodesByWeek(data.weeks, data.episodes);
  const completedWeeksDesc = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number);
  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    data.season?.id ?? null,
    accountSettingsData.spoilerFreeMode,
    completedWeeksDesc
  );

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
      revealedByEpisode={data.revealedByEpisode}
      publishedByNames={data.publishedByNames}
      season={data.season}
      participantsByEpisode={data.participantsByEpisode}
      roundTypes={data.roundTypes}
      roundTypesByEpisode={data.roundTypesByEpisode}
      inJeopardyByEpisode={data.inJeopardyByEpisode}
      spoilerFreeMode={accountSettingsData.spoilerFreeMode}
      allowedWeekIds={[...cutoff.allowedEpisodeIds]}
    />
  );
}
