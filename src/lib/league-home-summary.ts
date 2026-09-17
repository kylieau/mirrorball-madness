import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type LeagueHomeSummary = {
  id: string;
  name: string;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  nextDeadline: { label: string; iso: string } | null;
  danceCardOn: boolean;
  curtainCallOn: boolean;
  grandFinaleOn: boolean;
  recentJoins: { name: string; joinedAt: string }[];
  tookLead: boolean;
};

// Shared by /today (every league at once) and the per-league switcher sheet
// (every league *other than* the one currently being viewed) — one manager's
// rank/points/module status/pending-deadline/recent-history within a single
// league, computed the same way regardless of which page is asking.
export async function computeLeagueHomeSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  league: { id: string; name: string },
  upcomingEpisode: { id: string; week_number: number } | null,
  latestCompletedEpisodeId: string | null,
  latestCompletedResultsPublishedAt: string | null,
  joinCutoffMs: number,
  // null = unrestricted (current behavior). Callers pass the viewer's
  // spoiler cutoff so rank/points here never account for an episode the
  // viewer hasn't marked as watched yet.
  allowedEpisodeIds: Set<string> | null = null
): Promise<LeagueHomeSummary> {
  const [{ data: scoringSettings }, { data: members }, { data: scores }] = await Promise.all([
    supabase
      .from("scoring_settings")
      .select("judges_score_category_enabled, eliminations_category_enabled, bonus_picks_category_enabled")
      .eq("league_id", league.id)
      .single(),
    supabase.from("league_members").select("user_id, joined_at, profiles(display_name)").eq("league_id", league.id),
    supabase.from("weekly_manager_scores").select("episode_id, manager_id, total_points").eq("league_id", league.id),
  ]);

  const pointsByManager = new Map<string, number>();
  const previousPointsByManager = new Map<string, number>();
  for (const row of scores ?? []) {
    if (allowedEpisodeIds && !allowedEpisodeIds.has(row.episode_id)) continue;
    pointsByManager.set(row.manager_id, (pointsByManager.get(row.manager_id) ?? 0) + row.total_points);
    if (row.episode_id !== latestCompletedEpisodeId) {
      previousPointsByManager.set(row.manager_id, (previousPointsByManager.get(row.manager_id) ?? 0) + row.total_points);
    }
  }
  const standings = (members ?? []).map((m) => ({
    managerId: m.user_id,
    points: pointsByManager.get(m.user_id) ?? 0,
    previousPoints: previousPointsByManager.get(m.user_id) ?? 0,
  }));
  const rank = Math.max(
    1,
    [...standings].sort((a, b) => b.points - a.points).findIndex((s) => s.managerId === userId) + 1
  );
  const previousRank = latestCompletedEpisodeId
    ? Math.max(
        1,
        [...standings].sort((a, b) => b.previousPoints - a.previousPoints).findIndex((s) => s.managerId === userId) + 1
      )
    : null;

  const danceCardOn = scoringSettings?.judges_score_category_enabled ?? true;
  const curtainCallOn = scoringSettings?.eliminations_category_enabled ?? true;
  const grandFinaleOn = scoringSettings?.bonus_picks_category_enabled ?? false;
  const grandFinaleDeadline = grandFinaleOn
    ? (await supabase.rpc("effective_grand_finale_deadline", { p_league_id: league.id })).data ?? null
    : null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);

  let lockAt: string | null = null;
  let curtainCallPicksDue = false;
  if (curtainCallOn && upcomingEpisode) {
    const { data } = await supabase.rpc("prediction_lock_at", {
      p_league_id: league.id,
      p_episode_id: upcomingEpisode.id,
    });
    lockAt = data;
    const isLocked = !!lockAt && new Date() >= new Date(lockAt);
    // Don't nag about the next episode's pick until the previous episode's
    // results are actually published — a league on its first episode (no
    // previous episode at all) is unaffected.
    const previousResultsPublished = !latestCompletedEpisodeId || !!latestCompletedResultsPublishedAt;
    if (!isLocked && previousResultsPublished) {
      const { data: ownPrediction } = await supabase
        .from("predictions")
        .select("manager_id")
        .eq("league_id", league.id)
        .eq("episode_id", upcomingEpisode.id)
        .eq("manager_id", userId)
        .maybeSingle();
      curtainCallPicksDue = !ownPrediction;
    }
  }

  let grandFinalePicksDue = false;
  if (grandFinaleOn && !grandFinaleLocked) {
    const { data: ownGrandFinalePick } = await supabase
      .from("grand_finale_predictions")
      .select("manager_id")
      .eq("league_id", league.id)
      .eq("manager_id", userId)
      .limit(1)
      .maybeSingle();
    grandFinalePicksDue = !ownGrandFinalePick;
  }

  const deadlineCandidates: { label: string; iso: string }[] = [];
  if (curtainCallPicksDue && lockAt && new Date(lockAt) > new Date()) {
    deadlineCandidates.push({ label: "Curtain Call", iso: lockAt });
  }
  if (grandFinalePicksDue && grandFinaleDeadline && new Date(grandFinaleDeadline) > new Date()) {
    deadlineCandidates.push({ label: "Grand Finale", iso: grandFinaleDeadline });
  }
  deadlineCandidates.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  return {
    id: league.id,
    name: league.name,
    rank,
    totalMembers: standings.length,
    totalPoints: pointsByManager.get(userId) ?? 0,
    picksDue: curtainCallPicksDue || grandFinalePicksDue,
    nextDeadline: deadlineCandidates[0] ?? null,
    danceCardOn,
    curtainCallOn,
    grandFinaleOn,
    recentJoins: (members ?? [])
      .filter((m) => m.user_id !== userId && new Date(m.joined_at).getTime() >= joinCutoffMs)
      .map((m) => ({ name: m.profiles?.display_name ?? "Someone", joinedAt: m.joined_at })),
    tookLead: previousRank !== null && rank === 1 && previousRank !== 1,
  };
}
