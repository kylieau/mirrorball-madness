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

// Scores (By Week / By Couple). Enter Results is its own page at
// /admin/results/enter; old ?tab=enter links land there.
export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if ((await searchParams).tab === "enter") {
    redirect("/admin/results/enter");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accountSettingsData = await getAccountSettingsData(supabase, user.id);

  // No access gate beyond being signed in — the view tier is open to everyone
  // so anyone can see how scores and outcomes get entered. canPropose only
  // decides whether "Continue in Enter Results" shows; actions.ts re-checks.
  const canPropose =
    accountSettingsData.isSuperAdmin ||
    (await userIsAnyLeagueCommissioner(createAdminClient(), user.id));

  const data = await loadResultsPageData(supabase, createAdminClient());

  // Scores' View tier being open to any signed-in user is about access, not
  // about overriding the viewer's own spoiler preference — apply the same
  // cutoff This Week uses, for every viewer regardless of role. Enter
  // Results (its own page) stays unguarded, since correcting a week requires
  // seeing it.
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
      allCouples={data.allCouples}
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
      roundTypes={data.roundTypes}
      roundTypesByEpisode={data.roundTypesByEpisode}
      inJeopardyByEpisode={data.inJeopardyByEpisode}
      spoilerFreeMode={accountSettingsData.spoilerFreeMode}
      allowedWeekIds={[...cutoff.allowedEpisodeIds]}
    />
  );
}
