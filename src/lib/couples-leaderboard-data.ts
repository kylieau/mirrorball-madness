import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { weekResults } from "@/lib/score-history";

// Takes only weeks the viewer's spoiler cutoff already allows, so the results
// it fetches can't reveal anything the rest of the page hides.
export async function loadCoupleWeekResults(
  supabase: SupabaseClient<Database>,
  weeks: { week_number: number; episodeIds: string[] }[]
) {
  const episodeIds = weeks.flatMap((week) => week.episodeIds);
  if (episodeIds.length === 0) return [];
  const [{ data: danceRows }, { data: outcomeRows }] = await Promise.all([
    supabase.from("dance_scores").select("episode_id, couple_id, total_score").in("episode_id", episodeIds),
    supabase.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
  ]);
  return weeks.map((week) => ({
    weekNumber: week.week_number,
    ...weekResults(week.episodeIds, danceRows ?? [], outcomeRows ?? []),
  }));
}
