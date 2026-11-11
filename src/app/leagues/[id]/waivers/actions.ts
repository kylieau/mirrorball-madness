"use server";

import { revalidatePath } from "next/cache";
import type { RecastClaim } from "@/lib/recast";
import { createClient } from "@/lib/supabase/server";

// Replaces the team's whole waiver list, in rank order. The RPC decides who
// may claim, which couples and spots are valid, and whether a run is left.
export async function saveRecastList(leagueId: string, claims: RecastClaim[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_recast_list", {
    p_league_id: leagueId,
    p_claims: claims.map((claim) => ({
      couple_id: claim.coupleId,
      slot_number: claim.slotNumber,
      drop_couple_id: claim.dropCoupleId,
    })),
  });
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: error?.message ?? null };
}
