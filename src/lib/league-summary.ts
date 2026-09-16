import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { formatCountdown } from "@/lib/format-countdown";
import { getRankBadge, NEUTRAL_BADGE } from "@/lib/rank-badge";

export type LeagueSummary = {
  id: string;
  name: string;
  needsAttention: boolean;
  statusText: string;
  rankBadge: string;
};

// Used by /notifications for its "needs attention" signal. /today has its
// own richer per-league computation (src/lib/league-home-summary.ts) since
// it needs rank/points/module flags this simpler summary doesn't carry.
export async function computeLeagueSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  league: { id: string; name: string },
  upcomingEpisode: { id: string; week_number: number } | null
): Promise<LeagueSummary> {
  const [{ data: scoringSettings }, { data: members }, { data: scores }] = await Promise.all([
    supabase
      .from("scoring_settings")
      .select("eliminations_category_enabled, bonus_picks_category_enabled")
      .eq("league_id", league.id)
      .single(),
    supabase.from("league_members").select("user_id").eq("league_id", league.id),
    supabase.from("weekly_manager_scores").select("manager_id, total_points").eq("league_id", league.id),
  ]);

  const curtainCallOn = scoringSettings?.eliminations_category_enabled ?? true;
  const grandFinaleOn = scoringSettings?.bonus_picks_category_enabled ?? false;
  const grandFinaleDeadline = grandFinaleOn
    ? (await supabase.rpc("effective_grand_finale_deadline", { p_league_id: league.id })).data ?? null
    : null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);

  let curtainCallPending = false;
  let curtainCallLockAt: string | null = null;
  if (curtainCallOn && upcomingEpisode) {
    const { data: lockAt } = await supabase.rpc("prediction_lock_at", {
      p_league_id: league.id,
      p_episode_id: upcomingEpisode.id,
    });
    curtainCallLockAt = lockAt;
    const isLocked = !!lockAt && new Date() >= new Date(lockAt);
    if (!isLocked) {
      const { data: ownPrediction } = await supabase
        .from("predictions")
        .select("manager_id")
        .eq("league_id", league.id)
        .eq("episode_id", upcomingEpisode.id)
        .eq("manager_id", userId)
        .maybeSingle();
      curtainCallPending = !ownPrediction;
    }
  }

  let grandFinalePending = false;
  if (grandFinaleOn && !grandFinaleLocked) {
    const { count } = await supabase
      .from("grand_finale_predictions")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("manager_id", userId);
    grandFinalePending = !count;
  }

  const needsAttention = curtainCallPending || grandFinalePending;

  const pendingDeadlines: { label: string; iso: string }[] = [];
  if (curtainCallPending && curtainCallLockAt && new Date(curtainCallLockAt) > new Date()) {
    pendingDeadlines.push({ label: "Curtain Call", iso: curtainCallLockAt });
  }
  if (grandFinalePending && grandFinaleDeadline && new Date(grandFinaleDeadline) > new Date()) {
    pendingDeadlines.push({ label: "Grand Finale", iso: grandFinaleDeadline });
  }
  pendingDeadlines.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  let statusText: string;
  if (!needsAttention) {
    statusText = "Picks locked in — all set";
  } else if (pendingDeadlines[0]) {
    statusText = `${pendingDeadlines[0].label} locks in ${formatCountdown(pendingDeadlines[0].iso)}`;
  } else {
    const needed = [curtainCallPending && "Curtain Call", grandFinalePending && "Grand Finale"].filter(Boolean);
    statusText = `${needed.join(" & ")} picks needed`;
  }

  const pointsByManager = new Map<string, number>();
  for (const row of scores ?? []) {
    pointsByManager.set(row.manager_id, (pointsByManager.get(row.manager_id) ?? 0) + row.total_points);
  }
  const allPoints = (members ?? []).map((m) => pointsByManager.get(m.user_id) ?? 0);
  const userPoints = pointsByManager.get(userId) ?? 0;
  const rankBadge = (scores ?? []).length === 0 ? NEUTRAL_BADGE : getRankBadge(userPoints, allPoints);

  return { id: league.id, name: league.name, needsAttention, statusText, rankBadge };
}
