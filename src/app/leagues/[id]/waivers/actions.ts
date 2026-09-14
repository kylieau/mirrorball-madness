"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitWaiverClaim(
  leagueId: string,
  slotNumber: number,
  coupleId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_waiver_claim", {
    p_league_id: leagueId,
    p_slot_number: slotNumber,
    p_couple_id: coupleId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/leagues/${leagueId}/waivers`);
  revalidatePath(`/leagues/${leagueId}`);
  return { error: null };
}

export async function processReverseStandingsWaivers(
  leagueId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("process_reverse_standings_waivers", {
    p_league_id: leagueId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/leagues/${leagueId}/waivers`);
  return { error: null };
}

export async function approveWaiverClaim(
  leagueId: string,
  claimId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_waiver_claim", { p_claim_id: claimId });
  if (error) return { error: error.message };
  revalidatePath(`/leagues/${leagueId}/waivers`);
  return { error: null };
}

export async function rejectWaiverClaim(
  leagueId: string,
  claimId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_waiver_claim", { p_claim_id: claimId });
  if (error) return { error: error.message };
  revalidatePath(`/leagues/${leagueId}/waivers`);
  return { error: null };
}
