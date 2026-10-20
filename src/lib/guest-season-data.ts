import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { loadActiveSeasonId, loadSeasonSchedule } from "@/lib/viewer-season-data";

// The active season as a signed-out guest reads it. Guests only get results
// for completed weeks, and guest RLS independently limits scores and outcomes
// to published episodes, so a live reveal never reaches them.
export async function loadGuestSeason(supabase: SupabaseClient<Database>) {
  const seasonId = await loadActiveSeasonId(supabase);
  if (!seasonId) return { groupedWeeks: [], completedWeeks: [] };
  const { weekRows, episodeRows } = await loadSeasonSchedule(supabase, seasonId);
  const groupedWeeks = groupEpisodesByWeek(weekRows, episodeRows);
  return { groupedWeeks, completedWeeks: groupedWeeks.filter((week) => week.status === "completed") };
}
