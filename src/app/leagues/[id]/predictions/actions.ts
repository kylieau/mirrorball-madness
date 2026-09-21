"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitPrediction(
  leagueId: string,
  weekId: string,
  predictedEliminatedCoupleId: string | null,
  predictedEliminatedCoupleId2: string | null,
  predictedTopScorerCoupleId: string | null
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_prediction", {
    p_league_id: leagueId,
    p_week_id: weekId,
    // The generated RPC arg types don't model that these Postgres params
    // accept NULL (a manager can predict just one of the two categories,
    // and the second elimination slot only applies on a double-elimination
    // week).
    p_predicted_eliminated_couple_id: predictedEliminatedCoupleId as string,
    p_predicted_eliminated_couple_id_2: predictedEliminatedCoupleId2 as string,
    p_predicted_top_scorer_couple_id: predictedTopScorerCoupleId as string,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export async function submitGrandFinalePrediction(
  leagueId: string,
  coupleIdsInOrder: string[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_grand_finale_prediction", {
    p_league_id: leagueId,
    p_couple_ids: coupleIdsInOrder,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export type LeagueSaveResult = { leagueId: string; error: string | null };

// Each league is an independent save through the same RPC, so a lock or a
// disabled module in one destination can't sink the others. The RPC rejects
// leagues the caller isn't in, so ids from the client need no filtering here.
export async function submitPredictionToLeagues(
  leagueIds: string[],
  weekId: string,
  predictedEliminatedCoupleId: string | null,
  predictedEliminatedCoupleId2: string | null,
  predictedTopScorerCoupleId: string | null
): Promise<LeagueSaveResult[]> {
  return Promise.all(
    [...new Set(leagueIds)].map(async (leagueId) => ({
      leagueId,
      ...(await submitPrediction(
        leagueId,
        weekId,
        predictedEliminatedCoupleId,
        predictedEliminatedCoupleId2,
        predictedTopScorerCoupleId
      )),
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
