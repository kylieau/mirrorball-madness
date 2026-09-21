import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { shouldShowAnchorSyncControl } from "@/lib/season-clock";

// Round-trips every scoring_settings column except the Hard Deadline week so
// update_scoring_categories (which has no single-column write) only moves the
// anchor. Auth is the RPC's commissioner check, same as the Settings save path.
export async function syncSeasonClockAnchor(
  supabase: SupabaseClient<Database>,
  leagueId: string
): Promise<{ error: string | null; anchorWeek: number | null }> {
  const { data: lockWeek, error: lockError } = await supabase.rpc("effective_hard_deadline_week", {
    p_league_id: leagueId,
  });
  if (lockError) return { error: lockError.message, anchorWeek: null };
  if (lockWeek == null) {
    return { error: "No Hard Deadline week to sync to.", anchorWeek: null };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("scoring_settings")
    .select("*")
    .eq("league_id", leagueId)
    .single();
  if (settingsError || !settings) {
    return { error: settingsError?.message ?? "Scoring settings not found", anchorWeek: null };
  }

  if (!shouldShowAnchorSyncControl(true, settings.judges_score_starts_week, lockWeek)) {
    return { error: null, anchorWeek: settings.judges_score_starts_week };
  }

  const { error } = await supabase.rpc("update_scoring_categories", {
    p_league_id: leagueId,
    p_judges_score_category_enabled: settings.judges_score_category_enabled,
    p_eliminations_category_enabled: settings.eliminations_category_enabled,
    p_bonus_picks_category_enabled: settings.bonus_picks_category_enabled,
    p_judges_score_category_weight: settings.judges_score_category_weight,
    p_eliminations_category_weight: settings.eliminations_category_weight,
    p_bonus_picks_category_weight: settings.bonus_picks_category_weight,
    p_judges_score_starts_week: lockWeek,
    p_bonus_picks_scoring_method: settings.bonus_picks_scoring_method as string,
    p_bonus_picks_distance_penalty: settings.bonus_picks_distance_penalty as number,
    p_bonus_picks_tier_size: settings.bonus_picks_tier_size as number,
    p_judges_score_multiplier: settings.judges_score_multiplier,
    p_survival_points: settings.survival_points,
    p_first_place_points: settings.first_place_points,
    p_second_place_points: settings.second_place_points,
    p_third_place_points: settings.third_place_points,
    p_fourth_place_points: settings.fourth_place_points,
    p_fifth_place_points: settings.fifth_place_points,
    p_elimination_prediction_points: settings.elimination_prediction_points,
    p_top_scorer_prediction_points: settings.top_scorer_prediction_points,
    p_bonus_picks_points_per_correct: settings.bonus_picks_points_per_correct,
    p_bonus_picks_first_place_points: settings.bonus_picks_first_place_points,
    p_bonus_picks_second_place_points: settings.bonus_picks_second_place_points,
    p_bonus_picks_third_place_points: settings.bonus_picks_third_place_points,
    p_bonus_picks_fourth_place_points: settings.bonus_picks_fourth_place_points,
    p_bonus_picks_fifth_place_points: settings.bonus_picks_fifth_place_points,
    p_bonus_picks_tier_pay_style: settings.bonus_picks_tier_pay_style,
  });
  if (error) return { error: error.message, anchorWeek: null };
  return { error: null, anchorWeek: lockWeek };
}
