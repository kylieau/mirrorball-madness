import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { changeDanceReveal, changeTeamReveal } from "./episode-reveal";

export async function revealDance(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string; slot: number }, actorId: string) {
  return changeDanceReveal(admin, input, actorId, false);
}

export async function undoDanceReveal(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string; slot: number }, actorId: string) {
  return changeDanceReveal(admin, input, actorId, true);
}

export async function revealTeam(admin: SupabaseClient<Database>, input: { episodeId: string; teamId: string }, actorId: string) {
  return changeTeamReveal(admin, input, actorId, false);
}

export async function undoTeamReveal(admin: SupabaseClient<Database>, input: { episodeId: string; teamId: string }, actorId: string) {
  return changeTeamReveal(admin, input, actorId, true);
}
