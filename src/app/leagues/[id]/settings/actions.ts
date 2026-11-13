"use server";

import type { Json } from "@/lib/supabase/types";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { confirmLifeline, loadLifelinePreview, type LifelinePreview } from "@/lib/lifeline-enable";
import { loadViewerSeason } from "@/lib/viewer-season-data";
import { syncSeasonClockAnchor as writeSeasonClockAnchor } from "@/lib/season-clock-sync";
import { parseLatePercent, percentToLateFactor } from "@/lib/grand-finale-late";
import type { PickLockCoast } from "@/lib/curtain-call-lock";
import type { CurtainCallPick } from "@/lib/curtain-call-picks";
import type { GrandFinaleMethod, TierPayStyle } from "@/lib/scoring";

export async function renameLeague(
  leagueId: string,
  name: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("rename_league", { p_league_id: leagueId, p_name: name });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  revalidatePath("/leagues", "layout");
  revalidatePath("/", "page");
  return { error: null };
}

export async function deleteLeague(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_league", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath("/leagues", "layout");
  revalidatePath("/", "page");
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

  revalidatePath(`/leagues/${leagueId}`, "layout");
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

  revalidatePath(`/leagues/${leagueId}`, "layout");
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

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export async function unlockGrandFinaleLate(
  leagueId: string,
  managerId: string,
  latePercentRaw: string,
  acknowledgeResolved: boolean
): Promise<{ error: string | null }> {
  const percent = parseLatePercent(latePercentRaw);
  if (percent === null) return { error: "Enter a whole percent from 0 to 100" };
  const lateFactor = percentToLateFactor(percent);

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_grand_finale_late", {
    p_league_id: leagueId,
    p_manager_id: managerId,
    p_late_factor: lateFactor,
    p_acknowledge_resolved: acknowledgeResolved,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

// Only closes an open, not-yet-submitted late entry -- the RPC itself
// refuses to touch one the manager already used.
export async function closeGrandFinaleLate(leagueId: string, managerId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_grand_finale_late", {
    p_league_id: leagueId,
    p_manager_id: managerId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export async function backfillCurtainCallPick(
  leagueId: string,
  entry: { managerId: string; weekId: string; pick: CurtainCallPick; pickMadeAt: string; reason: string }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: week } = await supabase
    .from("competition_weeks")
    .select("is_finale")
    .eq("id", entry.weekId)
    .maybeSingle();
  // The RPCs are the authority: site admins only, a reason and a pick time in
  // the past required, couples from the week's season. Generated RPC args are
  // typed non-null, but SQL takes null for an empty slot.
  const shared = {
    p_league_id: leagueId,
    p_week_id: entry.weekId,
    p_manager_id: entry.managerId,
    p_top_scorer: entry.pick.topScorer as string,
    p_pick_made_at: entry.pickMadeAt,
    p_reason: entry.reason,
  };
  const { error } = week?.is_finale
    ? await supabase.rpc("admin_backfill_podium_prediction", {
        ...shared,
        p_winner: entry.pick.podium[0] as string,
        p_runner_up: entry.pick.podium[1] as string,
        p_third: entry.pick.podium[2] as string,
      })
    : await supabase.rpc("admin_backfill_prediction", {
        ...shared,
        p_elimination: entry.pick.elim1 as string,
        p_elimination_2: entry.pick.elim2 as string,
      });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
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

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export type LeagueSettingsInput = {
  waiverMode: "locked" | "waivers";
  pickTimeLimitSeconds: number;
  predictionLockHoursBeforeAir: number;
  predictionLockCoast: PickLockCoast;
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
    // Recast has one method, reverse Dance Card standings. The generated RPC arg type
    // doesn't model that this Postgres param accepts NULL (required when
    // waiver_mode is "locked"); the DB happily allows it.
    p_waiver_claim_method: (input.waiverMode === "waivers" ? "reverse_standings" : null) as string,
    p_pick_time_limit_seconds: input.pickTimeLimitSeconds,
    p_prediction_lock_hours_before_air: input.predictionLockHoursBeforeAir,
    p_prediction_lock_coast: input.predictionLockCoast,
    p_draft_type: input.draftType,
    // Same generated-type gap as p_waiver_claim_method above: draft_scheduled_at
    // is nullable in Postgres, but the RPC arg type doesn't model that.
    p_draft_scheduled_at: input.draftScheduledAt as string,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export type ScoringCategoriesInput = {
  expectedRevision: number;
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
  curtainCallNearMissEnabled: boolean;
};

export async function updateScoringCategories(
  leagueId: string,
  input: ScoringCategoriesInput
): Promise<{ error: string | null; revision?: number }> {
  const supabase = await createClient();

  const values = {
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
    p_bonus_picks_tier_pay_style: input.bonusPicksTierPayStyle,
    p_curtain_call_near_miss_enabled: input.curtainCallNearMissEnabled,
  };
  const { data, error } = await supabase.rpc("update_scoring_categories_checked", {
    p_league_id: leagueId, p_expected_revision: input.expectedRevision,
    p_values: Object.fromEntries(Object.entries(values).filter(([key]) => key !== "p_league_id").map(([key, value]) => [key.slice(2), value])) as Json,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  revalidatePath("/", "page");
  return { error: null, revision: data?.revision };
}

export async function syncSeasonClockAnchor(
  leagueId: string
): Promise<{ error: string | null; anchorWeek: number | null; revision?: number }> {
  const supabase = await createClient();
  const result = await writeSeasonClockAnchor(supabase, leagueId);
  if (!result.error) {
    revalidatePath(`/leagues/${leagueId}`, "layout");
    revalidatePath("/", "page");
  }
  return result;
}

// Who may turn Lifeline on, and whether they may see the numbers yet: the
// Equalizer and its standings run through the latest published week, so a
// Spoiler-Free commissioner who is behind catches up first.
async function lifelineActor(leagueId: string): Promise<{ error: string } | { actorId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to change Lifeline" };

  const [{ data: commissioner }, { data: profile }, account, season] = await Promise.all([
    supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId)
      .eq("role", "commissioner")
      .or(`user_id.eq.${user.id},co_manager_id.eq.${user.id}`)
      .maybeSingle(),
    supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle(),
    getAccountSettingsData(supabase, user.id),
    loadViewerSeason(supabase, user.id),
  ]);
  if (!commissioner && !profile?.is_super_admin) return { error: "Only a commissioner can turn on Lifeline" };

  const latestCompleted = Math.max(
    0,
    ...groupEpisodesByWeek(season.weekRows, season.episodeRows)
      .filter((week) => week.status === "completed")
      .map((week) => week.week_number)
  );
  if (account.spoilerFreeMode && season.lastWatchedWeek < latestCompleted) {
    return { error: `Mark Week ${latestCompleted} watched to turn on Lifeline. Its numbers include that week's results.` };
  }
  return { actorId: user.id };
}

export async function previewLifeline(leagueId: string): Promise<{ error: string } | { preview: LifelinePreview }> {
  const actor = await lifelineActor(leagueId);
  if ("error" in actor) return actor;
  return loadLifelinePreview(createAdminClient(), leagueId);
}

export async function enableLifeline(
  leagueId: string,
  token: string,
  includeEqualizer: boolean
): Promise<{ error: string | null }> {
  const actor = await lifelineActor(leagueId);
  if ("error" in actor) return actor;
  const result = await confirmLifeline(createAdminClient(), leagueId, actor.actorId, token, includeEqualizer);
  if (result.error) return result;

  revalidatePath(`/leagues/${leagueId}`, "layout");
  revalidatePath("/", "page");
  return { error: null };
}

export async function disableLifeline(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_lifeline", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}
