"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createLeague(formData: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_league", {
    p_name: formData.get("name") as string,
    p_dance_card_enabled: formData.get("danceCardEnabled") !== null,
    p_curtain_call_enabled: formData.get("curtainCallEnabled") !== null,
    p_grand_finale_enabled: formData.get("grandFinaleEnabled") !== null,
  });

  if (error) {
    redirect(`/leagues?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  revalidatePath("/this-week");
  redirect(`/leagues/${data.id}?justCreated=1`);
}

export async function joinLeague(formData: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("join_league", {
    p_invite_code: formData.get("inviteCode") as string,
  });

  if (error) {
    redirect(`/leagues?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  revalidatePath("/this-week");
  redirect(`/leagues/${data.id}`);
}

// One "Join with Code" entry point for both code types — a league invite
// code and a co-manager invite code are separate pools, but the person
// typing one in doesn't know or care which. Tries join_league first; only
// falls back to join_as_co_manager on the exact "not found" message, so a
// real rejection of a valid league code (draft in progress, etc.) surfaces
// as-is instead of being masked by a co-manager lookup that would just fail
// with "not found" too.
export async function joinWithCode(formData: FormData) {
  const supabase = await createClient();
  const code = formData.get("inviteCode") as string;

  const { data, error } = await supabase.rpc("join_league", { p_invite_code: code });

  if (!error) {
    revalidatePath("/leagues", "layout");
    revalidatePath("/today");
    revalidatePath("/this-week");
    redirect(`/leagues/${data.id}`);
  }

  if (error.message !== "Invite code not found") {
    redirect(`/leagues?error=${encodeURIComponent(error.message)}`);
  }

  const { data: coManagerLeague, error: coManagerError } = await supabase.rpc("join_as_co_manager", {
    p_code: code,
  });

  if (coManagerError) {
    redirect(`/leagues?error=${encodeURIComponent(coManagerError.message)}`);
  }

  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  revalidatePath("/this-week");
  redirect(`/leagues/${coManagerLeague.id}`);
}

export async function joinAsCoManager(formData: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("join_as_co_manager", {
    p_code: formData.get("inviteCode") as string,
  });

  if (error) {
    redirect(`/leagues?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  revalidatePath("/this-week");
  redirect(`/leagues/${data.id}`);
}

export async function leaveLeague(leagueId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("leave_league", { p_league_id: leagueId });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/leagues", "layout");
  revalidatePath("/today");
  revalidatePath("/this-week");
  return { error: null };
}
