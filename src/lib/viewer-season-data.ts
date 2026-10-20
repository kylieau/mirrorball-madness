import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

// Request-scoped only (React cache): a fan page and the loaders it calls
// (draft context, spoiler cutoff, league switcher, other-league picks) share
// one read of each. Never cache these across requests: episode status, the
// spoiler marks and live scores drive what a viewer may see, and every read
// runs under that viewer's RLS. Each is keyed on the client too, so a call
// with a different client (another request, a service-role client) reads
// again.

export const loadActiveSeasonId = cache(async (supabase: Client): Promise<string | null> => {
  const { data } = await supabase.rpc("active_season_id");
  return data ?? null;
});

export const loadSpoilerProgress = cache(async (supabase: Client, userId: string, seasonId: string) => {
  const { data } = await supabase
    .from("spoiler_watch_progress")
    .select("last_watched_week, draft_unlocked_week")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();
  return { lastWatchedWeek: data?.last_watched_week ?? 0, draftUnlockedWeek: data?.draft_unlocked_week ?? 0 };
});

export const loadSeasonSchedule = cache(async (supabase: Client, seasonId: string) => {
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", seasonId)
      .order("week_number", { ascending: true }),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, duration_minutes, theme, status, results_published_at")
      .eq("season_id", seasonId),
  ]);
  return { weekRows: weekRows ?? [], episodeRows: episodeRows ?? [] };
});

export type ViewerSeason = Awaited<ReturnType<typeof loadViewerSeason>>;

export const loadViewerSeason = cache(async (supabase: Client, userId: string) => {
  const seasonId = await loadActiveSeasonId(supabase);
  if (!seasonId) {
    return { seasonId: null, lastWatchedWeek: 0, draftUnlockedWeek: 0, weekRows: [], episodeRows: [] };
  }
  const [progress, schedule] = await Promise.all([
    loadSpoilerProgress(supabase, userId, seasonId),
    loadSeasonSchedule(supabase, seasonId),
  ]);
  return { seasonId, ...progress, ...schedule };
});

// A co-manager's auth uid is on co_manager_id, never user_id, so both are
// matched; user_id on the row is that team's identity either way.
export const loadViewerMemberships = cache(async (supabase: Client, userId: string) => {
  const { data } = await supabase
    .from("league_members")
    .select("user_id, role, joined_at, leagues(id, name)")
    .or(`user_id.eq.${userId},co_manager_id.eq.${userId}`)
    .order("joined_at", { ascending: true });
  return data ?? [];
});

// Every season's couples, unfiltered like the pages always read them, so
// display-name disambiguation doesn't change; filter by season_id where only
// the active season matters.
export const loadAllCouples = cache(async (supabase: Client) => {
  const { data } = await supabase
    .from("couples")
    .select(
      "id, status, season_id, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"
    );
  return data ?? [];
});
