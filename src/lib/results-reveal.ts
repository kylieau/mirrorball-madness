import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { changeEpisodeReveal } from "./episode-reveal";

export async function revealCouple(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string }, actorId: string) {
  return changeEpisodeReveal(admin, input, actorId, false);
}

export async function undoReveal(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string }, actorId: string) {
  return changeEpisodeReveal(admin, input, actorId, true);
}
