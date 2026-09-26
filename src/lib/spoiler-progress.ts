import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { deriveWeekStatus } from "@/lib/competition-week";

// What the Spoiler-Free "I last watched" picker needs: the viewer's mark and
// every week whose results are fully published, newest first.
export type SpoilerProgress = { watchedThroughWeek: number; weekNumbers: number[] };

export async function loadSpoilerProgress(supabase: SupabaseClient<Database>, userId: string): Promise<SpoilerProgress> {
  const { data: seasonId } = await supabase.rpc("active_season_id");
  if (!seasonId) return { watchedThroughWeek: 0, weekNumbers: [] };

  const [{ data: progress }, { data: weeks }, { data: episodes }] = await Promise.all([
    supabase
      .from("spoiler_watch_progress")
      .select("last_watched_week")
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .maybeSingle(),
    supabase.from("competition_weeks").select("id, week_number").eq("season_id", seasonId),
    supabase.from("episodes").select("week_id, status, results_published_at").eq("season_id", seasonId),
  ]);

  const watchedThroughWeek = progress?.last_watched_week ?? 0;
  const published = (weeks ?? [])
    .filter((week) => {
      const weekEpisodes = (episodes ?? []).filter((episode) => episode.week_id === week.id);
      return deriveWeekStatus(weekEpisodes) === "completed" && weekEpisodes.every((episode) => episode.results_published_at);
    })
    .map((week) => week.week_number);
  // A week marked live while it was still posting stays listed so the current pick always resolves.
  const weekNumbers = [...new Set([...published, ...(watchedThroughWeek > 0 ? [watchedThroughWeek] : [])])].sort(
    (a, b) => b - a
  );
  return { watchedThroughWeek, weekNumbers };
}
