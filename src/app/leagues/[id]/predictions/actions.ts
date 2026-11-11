"use server";

import { revalidatePath } from "next/cache";
import type { CurtainCallPick } from "@/lib/curtain-call-picks";
import { createClient } from "@/lib/supabase/server";

// The generated RPC arg types don't model that these Postgres params accept
// NULL (a manager can predict just one category, the second elimination slot
// only applies on a double-elimination week, and clearing a podium is three
// nulls).
async function submitPrediction(
  leagueId: string,
  weekId: string,
  pick: CurtainCallPick,
  isFinale: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = isFinale
    ? await supabase.rpc("submit_podium_prediction", {
        p_league_id: leagueId,
        p_week_id: weekId,
        p_winner: pick.podium[0] as string,
        p_runner_up: pick.podium[1] as string,
        p_third: pick.podium[2] as string,
        p_top_scorer: pick.topScorer as string,
      })
    : await supabase.rpc("submit_prediction", {
        p_league_id: leagueId,
        p_week_id: weekId,
        p_predicted_eliminated_couple_id: pick.elim1 as string,
        p_predicted_eliminated_couple_id_2: pick.elim2 as string,
        p_predicted_top_scorer_couple_id: pick.topScorer as string,
      });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

async function submitGrandFinalePrediction(
  leagueId: string,
  coupleIdsInOrder: string[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_grand_finale_prediction", {
    p_league_id: leagueId,
    p_couple_ids: coupleIdsInOrder,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export type LeagueSaveResult = { leagueId: string; error: string | null };

// Each league is an independent save through the same RPC, so a lock or a
// disabled module in one destination can't sink the others. The RPC rejects
// leagues the caller isn't in, so ids from the client need no filtering here.
// The Finale week saves a podium in place of the elimination pick; which one
// a week takes is read here, not taken from the client.
export async function submitPredictionToLeagues(
  leagueIds: string[],
  weekId: string,
  pick: CurtainCallPick
): Promise<LeagueSaveResult[]> {
  const supabase = await createClient();
  const { data: week } = await supabase.from("competition_weeks").select("is_finale").eq("id", weekId).maybeSingle();
  const isFinale = week?.is_finale ?? false;
  return Promise.all(
    [...new Set(leagueIds)].map(async (leagueId) => ({
      leagueId,
      ...(await submitPrediction(leagueId, weekId, pick, isFinale)),
    }))
  );
}

export async function submitGrandFinalePredictionToLeagues(
  leagueIds: string[],
  coupleIdsInOrder: string[]
): Promise<LeagueSaveResult[]> {
  return Promise.all(
    [...new Set(leagueIds)].map(async (leagueId) => ({
      leagueId,
      ...(await submitGrandFinalePrediction(leagueId, coupleIdsInOrder)),
    }))
  );
}
