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
