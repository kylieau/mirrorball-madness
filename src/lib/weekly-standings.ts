import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeekManagerScoreRow } from "./draft-scores";
import type { Database } from "./supabase/types";

// Every reader that shows or ranks totals reads weekly_manager_standings:
// weekly_manager_scores plus Lifeline and trade transfers, which that table's
// writers know nothing about.
export async function loadWeeklyStandings(
  supabase: SupabaseClient<Database>,
  leagueId: string
): Promise<WeekManagerScoreRow[]> {
  const { data, error } = await supabase
    .from("weekly_manager_standings")
    .select("week_id, manager_id, roster_points, prediction_points, grand_finale_points, lifeline_points, transfer_points, total_points")
    .eq("league_id", leagueId);
  if (error) {
    // Without apply-lifeline.sql there is no view, and nothing to add either.
    const stored = await supabase
      .from("weekly_manager_scores")
      .select("week_id, manager_id, roster_points, prediction_points, grand_finale_points, total_points")
      .eq("league_id", leagueId);
    return stored.data ?? [];
  }
  return data.flatMap((row) =>
    row.week_id && row.manager_id
      ? [
          {
            week_id: row.week_id,
            manager_id: row.manager_id,
            roster_points: Number(row.roster_points ?? 0),
            prediction_points: Number(row.prediction_points ?? 0),
            grand_finale_points: Number(row.grand_finale_points ?? 0),
            lifeline_points: Number(row.lifeline_points ?? 0),
            transfer_points: Number(row.transfer_points ?? 0),
            total_points: Number(row.total_points ?? 0),
          },
        ]
      : []
  );
}
