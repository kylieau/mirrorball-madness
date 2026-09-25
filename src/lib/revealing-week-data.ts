import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { findRevealingWeek, scoredWeekIds } from "@/lib/revealing-week";

type WeekLike = {
  id: string;
  week_number: number;
  episodes: { id: string; status: string; results_published_at?: string | null }[];
};

// One query: which unpublished episodes already have live dance scores.
// `visible` is whether this viewer's Spoiler-Free setting lets them see it.
export async function loadRevealingWeek<W extends WeekLike>(
  supabase: SupabaseClient<Database>,
  weeks: W[],
  cutoff: { spoilerFreeMode: boolean; lastWatchedWeek: number | null; allowedEpisodeIds: ReadonlySet<string> }
) {
  const unpublishedEpisodeIds = weeks
    .flatMap((week) => week.episodes)
    .filter((episode) => episode.status !== "completed" && !episode.results_published_at)
    .map((episode) => episode.id);
  const { data: posted } =
    unpublishedEpisodeIds.length > 0
      ? await supabase.from("dance_scores").select("episode_id").in("episode_id", unpublishedEpisodeIds)
      : { data: [] as { episode_id: string }[] };

  const revealing = findRevealingWeek(weeks, new Set((posted ?? []).map((row) => row.episode_id)));
  const scoredIds = scoredWeekIds(cutoff, revealing ? { id: revealing.week.id, week_number: revealing.week.week_number } : null);
  const visible = !!revealing && scoredIds.has(revealing.week.id);
  return { revealing, scoredIds, visible };
}
