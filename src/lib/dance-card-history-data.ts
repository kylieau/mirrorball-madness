import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DanceCardWeek } from "@/lib/dance-card-v2";
import { danceScoreColumns } from "@/lib/episode-teams";
import { loadSeasonSchedule, loadTeamsMode } from "@/lib/viewer-season-data";
import { danceCardPriorWeeks } from "@/lib/weekly-score-rows";

type DanceRow = { episode_id: string; couple_id: string; total_score: number; scaled_score: number; max_score?: number | null; team_id?: string | null };

// The season's weeks before `beforeWeekNumber` as the Dance Card v2 ledger
// reads them, for a draft night's standings. Draft scores only show for a
// week the viewer has marked watched, so every week before it is already
// within their cutoff.
export const loadDanceCardHistory = cache(
  async (supabase: SupabaseClient<Database>, seasonId: string, beforeWeekNumber: number): Promise<DanceCardWeek[]> => {
    const [{ weekRows, episodeRows }, mode] = await Promise.all([loadSeasonSchedule(supabase, seasonId), loadTeamsMode(supabase)]);
    const weekNumberById = new Map(weekRows.map((w) => [w.id, w.week_number]));
    const episodeIds = episodeRows
      .filter((e) => e.week_id && (weekNumberById.get(e.week_id) ?? Infinity) < beforeWeekNumber)
      .map((e) => e.id);
    if (episodeIds.length === 0) return [];
    const [{ data: dances }, { data: outcomes }] = await Promise.all([
      supabase
        .from("dance_scores")
        .select(danceScoreColumns(mode, "episode_id, couple_id, total_score, scaled_score", { teamId: true }))
        .in("episode_id", episodeIds),
      supabase.from("episode_results").select("episode_id, couple_id, bonus_points, outcome").in("episode_id", episodeIds),
    ]);
    return danceCardPriorWeeks(
      {
        episodes: episodeRows,
        weeks: weekRows,
        dances: ((dances ?? []) as unknown as DanceRow[]).map((row) => ({ ...row, max_score: row.max_score ?? null })),
        outcomes: outcomes ?? [],
      },
      beforeWeekNumber
    );
  }
);
