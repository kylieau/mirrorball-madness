"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSpoilerProgress, type SpoilerProgress } from "@/lib/spoiler-progress";

export async function markEpisodesWatchedThrough(weekNumber: number): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_episodes_watched_through", { p_week_number: weekNumber });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}

// Mark Watched / I've finished the East broadcast. Also unlocks a released
// score draft for that week. Stay Updated keeps the watch-only call above.
export async function markWatchedAndUnlockDrafts(weekNumber: number): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_draft_scores_through", { p_week_number: weekNumber });
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

export async function getSpoilerProgress(): Promise<SpoilerProgress> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { watchedThroughWeek: 0, weekNumbers: [] };
  return loadSpoilerProgress(supabase, user.id);
}
