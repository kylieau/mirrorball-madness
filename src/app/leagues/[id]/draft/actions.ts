"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LeagueSaveResult } from "@/app/leagues/[id]/predictions/actions";

export async function setDraftOrder(leagueId: string, orderedUserIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_draft_order", {
    p_league_id: leagueId,
    p_ordered_user_ids: orderedUserIds,
  });
  return { error: error?.message ?? null };
}

export async function startDraft(leagueId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_draft", { p_league_id: leagueId });
  return { error: error?.message ?? null };
}

export async function makeDraftPick(leagueId: string, coupleId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_draft_pick", {
    p_league_id: leagueId,
    p_couple_id: coupleId,
  });
  return { error: error?.message ?? null };
}

export async function makeAutoDraftPick(leagueId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_auto_draft_pick", {
    p_league_id: leagueId,
  });
  return { error: error?.message ?? null };
}

export async function setDraftAutopilot(leagueId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_draft_autopilot", {
    p_league_id: leagueId,
    p_enabled: enabled,
  });
  return { error: error?.message ?? null };
}

export async function setMemberDraftAutopilot(
  leagueId: string,
  userId: string,
  enabled: boolean
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_draft_autopilot", {
    p_league_id: leagueId,
    p_user_id: userId,
    p_enabled: enabled,
  });
  return { error: error?.message ?? null };
}

export async function undoLastPick(leagueId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_last_pick", {
    p_league_id: leagueId,
  });
  return { error: error?.message ?? null };
}

export async function resetDraft(leagueId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_draft", {
    p_league_id: leagueId,
  });
  if (error) return { error: error.message };
  // Reset is reachable from League Settings too, which has no realtime
  // channel to notice the draft went back to the lobby.
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return { error: null };
}

export async function setDraftQueue(leagueId: string, coupleIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_draft_queue", {
    p_league_id: leagueId,
    p_couple_ids: coupleIds,
  });
  return { error: error?.message ?? null };
}

// Each league is an independent save through the same RPC, so a finished draft
// or Dance Card being off in one destination can't sink the others.
export async function setDraftQueueForLeagues(
  leagueIds: string[],
  coupleIds: string[]
): Promise<LeagueSaveResult[]> {
  return Promise.all(
    [...new Set(leagueIds)].map(async (leagueId) => ({
      leagueId,
      ...(await setDraftQueue(leagueId, coupleIds)),
    }))
  );
}
