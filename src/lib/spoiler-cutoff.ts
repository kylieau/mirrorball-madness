import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type SpoilerCutoff<E extends { id: string; week_number: number }> = {
  spoilerFreeMode: boolean;
  lastWatchedWeek: number | null;
  allowedEpisodeIds: Set<string>;
  visibleEpisodes: E[];
  effectiveLatestEpisode: E | null;
  pendingRevealEpisode: E | null;
};

// Latest completed episode the viewer hasn't marked watched yet. Null when
// spoiler-free is off (or they're already caught up) so Home/This Week can
// share one rule: a newer completed week is still pending even if older
// weeks are already visible.
export function findPendingRevealEpisode<E extends { id: string; week_number: number }>(
  spoilerFreeMode: boolean,
  lastWatchedWeek: number | null,
  completedEpisodesDesc: E[]
): E | null {
  if (!spoilerFreeMode) return null;
  const latest = completedEpisodesDesc[0] ?? null;
  if (!latest || latest.week_number <= (lastWatchedWeek ?? 0)) return null;
  return latest;
}

// Degenerates to "everything visible" when spoiler-free mode is off (or
// there's no active season) so every caller can unconditionally filter
// against allowedEpisodeIds / read effectiveLatestEpisode instead of
// branching on spoilerFreeMode itself. completedEpisodesDesc must already
// be sorted week_number descending (the same order every caller already
// fetches it in) so effectiveLatestEpisode/visibleEpisodes[0] stay correct.
export async function resolveSpoilerCutoff<E extends { id: string; week_number: number }>(
  supabase: SupabaseClient<Database>,
  userId: string,
  seasonId: string | null,
  spoilerFreeMode: boolean,
  completedEpisodesDesc: E[]
): Promise<SpoilerCutoff<E>> {
  if (!spoilerFreeMode || !seasonId) {
    return {
      spoilerFreeMode: false,
      lastWatchedWeek: null,
      allowedEpisodeIds: new Set(completedEpisodesDesc.map((e) => e.id)),
      visibleEpisodes: completedEpisodesDesc,
      effectiveLatestEpisode: completedEpisodesDesc[0] ?? null,
      pendingRevealEpisode: null,
    };
  }

  const { data: progress } = await supabase
    .from("spoiler_watch_progress")
    .select("last_watched_week")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();

  const lastWatchedWeek = progress?.last_watched_week ?? 0;
  const visibleEpisodes = completedEpisodesDesc.filter((e) => e.week_number <= lastWatchedWeek);

  return {
    spoilerFreeMode: true,
    lastWatchedWeek,
    allowedEpisodeIds: new Set(visibleEpisodes.map((e) => e.id)),
    visibleEpisodes,
    effectiveLatestEpisode: visibleEpisodes[0] ?? null,
    pendingRevealEpisode: findPendingRevealEpisode(true, lastWatchedWeek, completedEpisodesDesc),
  };
}
