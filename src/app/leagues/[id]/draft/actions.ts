"use server";

import { createClient } from "@/lib/supabase/server";

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
  return { error: error?.message ?? null };
}

export async function setDraftQueue(leagueId: string, coupleIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_draft_queue", {
    p_league_id: leagueId,
    p_couple_ids: coupleIds,
  });
  return { error: error?.message ?? null };
}
