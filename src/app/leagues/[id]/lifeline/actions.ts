"use server";

import { revalidatePath } from "next/cache";
import { lifelineSaveSteps, type LifelinePickChange } from "@/lib/lifeline-picks";
import { createClient } from "@/lib/supabase/server";

// The RPCs decide who may pick, for which spot and until when.
export async function saveLifelinePicks(
  leagueId: string,
  weekId: string,
  changes: LifelinePickChange[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { clear, set } = lifelineSaveSteps(changes);
  let failure: string | null = null;
  for (const slotNumber of clear) {
    const { error } = await supabase.rpc("clear_lifeline_pick", {
      p_league_id: leagueId,
      p_week_id: weekId,
      p_slot_number: slotNumber,
    });
    failure ??= error?.message ?? null;
  }
  for (const pick of failure ? [] : set) {
    const { error } = await supabase.rpc("set_lifeline_pick", {
      p_league_id: leagueId,
      p_week_id: weekId,
      p_slot_number: pick.slotNumber,
      p_couple_id: pick.coupleId,
    });
    failure ??= error?.message ?? null;
  }

  revalidatePath(`/leagues/${leagueId}`, "layout");
  revalidatePath("/", "page");
  return { error: failure };
}
