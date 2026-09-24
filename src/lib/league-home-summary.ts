import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { findOwnMembership, isOwnMembership } from "@/lib/acting-manager";
import { hasCurtainCallPicks } from "@/lib/curtain-call-picks";

export type LeagueHomeSummary = {
  id: string;
  name: string;
  rank: number;
  totalMembers: number;
  totalPoints: number;
  picksDue: boolean;
  nextDeadline: { label: string; iso: string } | null;
  curtainCallLockAt: string | null;
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
  latestCompletedWeekId: string | null,
  latestCompletedResultsPublishedAt: string | null,
  joinCutoffMs: number,
  // null = unrestricted (current behavior). Callers pass the viewer's
  // spoiler cutoff so rank/points here never account for a week the
  // viewer hasn't marked as watched yet.
  allowedWeekIds: Set<string> | null = null
): Promise<LeagueHomeSummary> {
  const [{ data: scoringSettings }, { data: members }, { data: scores }] = await Promise.all([
    supabase
      .from("scoring_settings")
      .select("judges_score_category_enabled, eliminations_category_enabled, bonus_picks_category_enabled")
      .eq("league_id", league.id)
      .single(),
    supabase
      .from("league_members")
      .select("user_id, co_manager_id, joined_at, profiles!league_members_user_id_fkey(display_name)")
      .eq("league_id", league.id),
    supabase.from("weekly_manager_scores").select("week_id, manager_id, total_points").eq("league_id", league.id),
  ]);

  // A co-manager's auth uid never matches a manager_id/user_id column
  // directly — those stay keyed to the primary — so every "my team" lookup
  // below resolves through myTeamId instead of the raw viewer id.
  const myTeamId = findOwnMembership(members ?? [], userId)?.user_id ?? userId;

  const pointsByManager = new Map<string, number>();
  const previousPointsByManager = new Map<string, number>();
  for (const row of scores ?? []) {
    if (allowedWeekIds && !allowedWeekIds.has(row.week_id)) continue;
    pointsByManager.set(row.manager_id, (pointsByManager.get(row.manager_id) ?? 0) + row.total_points);
    if (row.week_id !== latestCompletedWeekId) {
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
    [...standings].sort((a, b) => b.points - a.points).findIndex((s) => s.managerId === myTeamId) + 1
  );
  const previousRank = latestCompletedWeekId
    ? Math.max(
        1,
        [...standings].sort((a, b) => b.previousPoints - a.previousPoints).findIndex((s) => s.managerId === myTeamId) + 1
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
      p_week_id: upcomingEpisode.id,
    });
    lockAt = data;
    const isLocked = !!lockAt && new Date() >= new Date(lockAt);
    // Don't nag about the next week's pick until the previous week's
    // results are actually published — a league on its first week (no
    // previous week at all) is unaffected.
    const previousResultsPublished = !latestCompletedWeekId || !!latestCompletedResultsPublishedAt;
    if (!isLocked && previousResultsPublished) {
      const { data: ownPrediction } = await supabase
        .from("predictions")
        .select("predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
        .eq("league_id", league.id)
        .eq("week_id", upcomingEpisode.id)
        .eq("manager_id", myTeamId)
        .maybeSingle();
      curtainCallPicksDue = !hasCurtainCallPicks(ownPrediction);
    }
  }

  let grandFinalePicksDue = false;
  if (grandFinaleOn && !grandFinaleLocked) {
    const { data: ownGrandFinalePick } = await supabase
      .from("grand_finale_predictions")
      .select("manager_id")
      .eq("league_id", league.id)
      .eq("manager_id", myTeamId)
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
    totalPoints: pointsByManager.get(myTeamId) ?? 0,
    picksDue: curtainCallPicksDue || grandFinalePicksDue,
    nextDeadline: deadlineCandidates[0] ?? null,
    curtainCallLockAt: lockAt,
    danceCardOn,
    curtainCallOn,
    grandFinaleOn,
    recentJoins: (members ?? [])
      .filter((m) => !isOwnMembership(m, userId) && new Date(m.joined_at).getTime() >= joinCutoffMs)
      .map((m) => ({ name: m.profiles?.display_name ?? "Someone", joinedAt: m.joined_at })),
    tookLead: previousRank !== null && rank === 1 && previousRank !== 1,
  };
}
