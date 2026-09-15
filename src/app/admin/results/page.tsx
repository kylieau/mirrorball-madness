import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminResultsTabs } from "@/components/admin-results-tabs";
import { resultsEntryOpenToAll } from "@/lib/results";
import { buildCoupleDisplayNames, sortJudgesForDisplay } from "@/lib/couple-display";
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

  if (!accountSettingsData.isSuperAdmin && !resultsEntryOpenToAll()) {
    redirect("/");
  }

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");

  const coupleFields =
    "id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)";

  const [
    { data: activeCouplesRaw },
    { data: allCouplesRaw },
    { data: judges },
    { data: danceStyles },
    { data: episodes },
    { data: danceScores },
    { data: judgeScores },
    { data: episodeResults },
  ] = await Promise.all([
    supabase
      .from("couples")
      .select(coupleFields)
      .eq("status", "active")
      .eq("season_id", activeSeasonId ?? ""),
    supabase.from("couples").select(coupleFields),
    supabase.from("people").select("id, name").eq("role", "judge").order("name"),
    supabase.from("dance_styles").select("id, name").order("name"),
    supabase
      .from("episodes")
      .select("id, week_number, airs_at, theme, status, is_finale, is_elimination_week")
      .order("week_number"),
    supabase
      .from("dance_scores")
      .select("id, episode_id, couple_id, dance_style_id, total_score"),
    supabase.from("judge_scores").select("dance_score_id, judge_id, score"),
    supabase
      .from("episode_results")
      .select(
        "episode_id, couple_id, outcome, was_bottom_two, was_bottom_three, saved_by_judges, was_team_dance, had_immunity, bonus_points, bonus_note"
      ),
  ]);

  const flatten = (rows: typeof activeCouplesRaw) =>
    (rows ?? [])
      .map((c) => ({
        id: c.id,
        celebrity_name: c.celebrity?.name ?? "Unknown",
        pro_name: c.pro?.name ?? "Unknown",
      }))
      .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  const activeCouples = flatten(activeCouplesRaw);
  const allCouples = flatten(allCouplesRaw);

  return (
    <AdminResultsTabs
      accountSettingsData={accountSettingsData}
      viewerEmail={user.email ?? ""}
      activeCouples={activeCouples}
      allCouples={allCouples}
      activeCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(activeCouples))}
      allCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(allCouples))}
      judges={sortJudgesForDisplay(judges ?? [])}
      danceStyles={danceStyles ?? []}
      episodes={episodes ?? []}
      danceScores={danceScores ?? []}
      judgeScores={judgeScores ?? []}
      episodeResults={episodeResults ?? []}
    />
  );
}
