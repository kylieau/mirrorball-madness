import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { danceMaxScore, danceScoreColumns } from "@/lib/episode-teams";
import { weekResults } from "@/lib/score-history";
import { loadTeamsMode } from "@/lib/viewer-season-data";

// Takes only weeks the viewer's spoiler cutoff already allows, so the results
// it fetches can't reveal anything the rest of the page hides.
export async function loadCoupleWeekResults(
  supabase: SupabaseClient<Database>,
  weeks: { week_number: number; episodeIds: string[] }[]
) {
  const episodeIds = weeks.flatMap((week) => week.episodeIds);
  if (episodeIds.length === 0) return [];
  const mode = await loadTeamsMode(supabase);
  const [{ data: danceRows }, { data: outcomeRows }] = await Promise.all([
    supabase
      .from("dance_scores")
      .select(danceScoreColumns(mode, "episode_id, couple_id, total_score, scaled_score"))
      .in("episode_id", episodeIds),
    supabase.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
  ]);
  const dances = ((danceRows ?? []) as unknown as { episode_id: string; couple_id: string; total_score: number; scaled_score: number; max_score?: number | null }[]).map(
    (row) => ({ ...row, max_score: danceMaxScore(row) })
  );
  return weeks.map((week) => ({
    weekNumber: week.week_number,
    ...weekResults(week.episodeIds, dances, outcomeRows ?? []),
  }));
}
