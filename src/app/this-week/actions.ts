"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markEpisodesWatchedThrough(weekNumber: number): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_episodes_watched_through", { p_week_number: weekNumber });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function unmarkEpisodesWatchedFrom(weekNumber: number): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unmark_episodes_watched_from", { p_week_number: weekNumber });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function getWatchedThroughWeek(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: seasonId } = await supabase.rpc("active_season_id");
  if (!user || !seasonId) return 0;

  const { data } = await supabase
    .from("spoiler_watch_progress")
    .select("last_watched_week")
    .eq("user_id", user.id)
    .eq("season_id", seasonId)
    .maybeSingle();
  return data?.last_watched_week ?? 0;
}
