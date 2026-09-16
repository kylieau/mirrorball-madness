import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminResultsTabs } from "@/components/admin-results-tabs";
import { resultsEntryOpenToAll } from "@/lib/results";
import { loadDraftForEpisode, type DraftState } from "@/lib/results-draft";
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

  const { data: season } = await supabase
    .from("seasons")
    .select("id, premiere_date, total_episodes, finale_date")
    .eq("id", activeSeasonId ?? "")
    .single();

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
    { data: episodeParticipants },
  ] = await Promise.all([
    supabase
      .from("couples")
      .select(coupleFields)
      .eq("status", "active")
      .eq("season_id", activeSeasonId ?? ""),
    supabase.from("couples").select(`${coupleFields}, status, elimination_week`),
    supabase.from("people").select("id, name").eq("role", "judge").order("name"),
    supabase.from("dance_styles").select("id, name").order("name"),
    supabase
      .from("episodes")
      .select(
        "id, week_number, airs_at, theme, status, is_finale, is_elimination_week, is_double_elimination_week, results_published_at, results_published_by"
      )
      .order("week_number"),
    supabase
      .from("dance_scores")
      .select("id, episode_id, couple_id, dance_style_id, total_score"),
    supabase.from("judge_scores").select("dance_score_id, judge_id, score"),
    supabase
      .from("episode_results")
      .select(
        "episode_id, couple_id, outcome, saved_by_judges, was_team_dance, had_immunity, bonus_points, bonus_note"
      ),
    supabase.from("episode_participants").select("episode_id, couple_id"),
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
  const allCouplesWithStatus = (allCouplesRaw ?? [])
    .map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
      status: c.status,
      elimination_week: c.elimination_week,
    }))
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  // Draft tables grant nothing to authenticated — this is the one place the
  // page needs the admin client instead of the user's own, to read every
  // scheduled episode's in-progress draft up front (so the form can
  // rehydrate immediately on episode selection instead of round-tripping).
  const admin = createAdminClient();
  const draftEntries = await Promise.all(
    (episodes ?? []).map(async (e) => [e.id, await loadDraftForEpisode(admin, e.id)] as const)
  );
  const draftsByEpisode: Record<string, DraftState> = Object.fromEntries(draftEntries);

  const publisherIds = [...new Set((episodes ?? []).map((e) => e.results_published_by).filter((id): id is string => !!id))];
  const { data: publisherProfiles } =
    publisherIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", publisherIds)
      : { data: [] };
  const publishedByNames = Object.fromEntries((publisherProfiles ?? []).map((p) => [p.id, p.display_name]));

  const participantsByEpisode: Record<string, string[]> = {};
  for (const p of episodeParticipants ?? []) {
    (participantsByEpisode[p.episode_id] ??= []).push(p.couple_id);
  }

  return (
    <AdminResultsTabs
      accountSettingsData={accountSettingsData}
      viewerEmail={user.email ?? ""}
      activeCouples={activeCouples}
      allCouples={allCouples}
      allCouplesWithStatus={allCouplesWithStatus}
      activeCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(activeCouples))}
      allCoupleDisplayNames={Object.fromEntries(buildCoupleDisplayNames(allCouples))}
      judges={sortJudgesForDisplay(judges ?? [])}
      danceStyles={danceStyles ?? []}
      episodes={episodes ?? []}
      danceScores={danceScores ?? []}
      judgeScores={judgeScores ?? []}
      episodeResults={episodeResults ?? []}
      draftsByEpisode={draftsByEpisode}
      publishedByNames={publishedByNames}
      season={season}
      participantsByEpisode={participantsByEpisode}
    />
  );
}
