"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncSeasonClockAnchor as writeSeasonClockAnchor } from "@/lib/season-clock-sync";
import type { GrandFinaleMethod, TierPayStyle } from "@/lib/scoring";

export async function renameLeague(
  leagueId: string,
  name: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("rename_league", { p_league_id: leagueId, p_name: name });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteLeague(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_league", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  redirect("/leagues");
}

export async function removeMember(
  leagueId: string,
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("remove_league_member", {
    p_league_id: leagueId,
    p_user_id: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export async function promoteMember(
  leagueId: string,
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("promote_to_commissioner", {
    p_league_id: leagueId,
    p_user_id: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export async function generateCoManagerInviteCode(
  leagueId: string
): Promise<{ error: string | null; code: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("generate_co_manager_invite_code", {
    p_league_id: leagueId,
  });
  if (error) return { error: error.message, code: null };

  return { error: null, code: data };
}

export async function removeCoManager(
  leagueId: string,
  teamUserId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("remove_co_manager", {
    p_league_id: leagueId,
    p_team_user_id: teamUserId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/settings`);
  return { error: null };
}

export async function demoteMember(
  leagueId: string,
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("demote_commissioner", {
    p_league_id: leagueId,
    p_user_id: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export type LeagueSettingsInput = {
  waiverMode: "locked" | "waivers";
  waiverClaimMethod: "reverse_standings" | "fcfs" | "manual";
  pickTimeLimitSeconds: number;
  predictionLockHoursBeforeAir: number;
  draftType: "snake" | "linear" | "custom";
  draftScheduledAt: string | null;
};

export async function updateLeagueSettings(
  leagueId: string,
  input: LeagueSettingsInput
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_league_settings", {
    p_league_id: leagueId,
    p_waiver_mode: input.waiverMode,
    // The generated RPC arg type doesn't model that this Postgres param accepts
    // NULL (required when waiver_mode is "locked"); the DB happily allows it.
    p_waiver_claim_method: (input.waiverMode === "waivers" ? input.waiverClaimMethod : null) as string,
    p_pick_time_limit_seconds: input.pickTimeLimitSeconds,
    p_prediction_lock_hours_before_air: input.predictionLockHoursBeforeAir,
    p_draft_type: input.draftType,
    // Same generated-type gap as p_waiver_claim_method above: draft_scheduled_at
    // is nullable in Postgres, but the RPC arg type doesn't model that.
    p_draft_scheduled_at: input.draftScheduledAt as string,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export type ScoringCategoriesInput = {
  judgesScoreCategoryEnabled: boolean;
  eliminationsCategoryEnabled: boolean;
  bonusPicksCategoryEnabled: boolean;
  judgesScoreCategoryWeight: number;
  eliminationsCategoryWeight: number;
  bonusPicksCategoryWeight: number;
  judgesScoreStartsWeek: number;
  bonusPicksScoringMethod: GrandFinaleMethod | null;
  bonusPicksDistancePenalty: number | null;
  bonusPicksTierSize: number | null;
  bonusPicksTierPayStyle: TierPayStyle;
  judgesScoreMultiplier: number;
  survivalPoints: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  thirdPlacePoints: number;
  fourthPlacePoints: number;
  fifthPlacePoints: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  bonusPicksPointsPerCorrect: number;
  bonusPicksFirstPlacePoints: number;
  bonusPicksSecondPlacePoints: number;
  bonusPicksThirdPlacePoints: number;
  bonusPicksFourthPlacePoints: number;
  bonusPicksFifthPlacePoints: number;
};

export async function updateScoringCategories(
  leagueId: string,
  input: ScoringCategoriesInput
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_scoring_categories", {
    p_league_id: leagueId,
    p_judges_score_category_enabled: input.judgesScoreCategoryEnabled,
    p_eliminations_category_enabled: input.eliminationsCategoryEnabled,
    p_bonus_picks_category_enabled: input.bonusPicksCategoryEnabled,
    p_judges_score_category_weight: input.judgesScoreCategoryWeight,
    p_eliminations_category_weight: input.eliminationsCategoryWeight,
    p_bonus_picks_category_weight: input.bonusPicksCategoryWeight,
    p_judges_score_starts_week: input.judgesScoreStartsWeek,
    // These three are nullable in Postgres; the generated RPC arg type doesn't
    // model that (same gap as p_waiver_claim_method/p_draft_scheduled_at above).
    p_bonus_picks_scoring_method: input.bonusPicksScoringMethod as string,
    p_bonus_picks_distance_penalty: input.bonusPicksDistancePenalty as number,
    p_bonus_picks_tier_size: input.bonusPicksTierSize as number,
    p_judges_score_multiplier: input.judgesScoreMultiplier,
    p_survival_points: input.survivalPoints,
    p_first_place_points: input.firstPlacePoints,
    p_second_place_points: input.secondPlacePoints,
    p_third_place_points: input.thirdPlacePoints,
    p_fourth_place_points: input.fourthPlacePoints,
    p_fifth_place_points: input.fifthPlacePoints,
    p_elimination_prediction_points: input.eliminationPredictionPoints,
    p_top_scorer_prediction_points: input.topScorerPredictionPoints,
    p_bonus_picks_points_per_correct: input.bonusPicksPointsPerCorrect,
    p_bonus_picks_first_place_points: input.bonusPicksFirstPlacePoints,
    p_bonus_picks_second_place_points: input.bonusPicksSecondPlacePoints,
    p_bonus_picks_third_place_points: input.bonusPicksThirdPlacePoints,
    p_bonus_picks_fourth_place_points: input.bonusPicksFourthPlacePoints,
    p_bonus_picks_fifth_place_points: input.bonusPicksFifthPlacePoints,
    p_bonus_picks_tier_pay_style: input.bonusPicksTierPayStyle,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath("/today");
  return { error: null };
}

export async function syncSeasonClockAnchor(
  leagueId: string
): Promise<{ error: string | null; anchorWeek: number | null }> {
  const supabase = await createClient();
  const result = await writeSeasonClockAnchor(supabase, leagueId);
  if (!result.error) {
    revalidatePath(`/leagues/${leagueId}/settings`);
    revalidatePath(`/leagues/${leagueId}`);
    revalidatePath("/today");
  }
  return result;
}
