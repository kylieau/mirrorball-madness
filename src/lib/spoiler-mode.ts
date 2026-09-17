import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Flips profiles.spoiler_free_mode. On the very first enable (no existing
// spoiler_watch_progress row for the active season), seeds last_watched_week
// to one episode *behind* the current latest completed episode — so the
// most recently published episode is always immediately gated behind "mark
// as watched," even if the user already saw it. This deliberately plays it
// safe: someone turning the mode on can't be assumed to have definitely
// watched the latest episode yet, so the seed always leaves exactly one
// episode pending rather than risk exposing it. A later disable-then-re-
// enable leaves the existing progress row untouched.
export async function setSpoilerFreeMode(
  supabase: SupabaseClient<Database>,
  userId: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  if (enabled) {
    const { data: activeSeasonId } = await supabase.rpc("active_season_id");

    if (activeSeasonId) {
      const { data: existingProgress } = await supabase
        .from("spoiler_watch_progress")
        .select("user_id")
        .eq("user_id", userId)
        .eq("season_id", activeSeasonId)
        .maybeSingle();

      if (!existingProgress) {
        const { data: latestCompleted } = await supabase
          .from("episodes")
          .select("week_number")
          .eq("season_id", activeSeasonId)
          .eq("status", "completed")
          .order("week_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const seedWeek = latestCompleted ? Math.max(0, latestCompleted.week_number - 1) : 0;
        if (seedWeek > 0) {
          const { error: seedError } = await supabase.rpc("mark_episodes_watched_through", {
            p_week_number: seedWeek,
          });
          if (seedError) return { error: seedError.message };
        }
      }
    }
  }

  const { error } = await supabase.from("profiles").update({ spoiler_free_mode: enabled }).eq("id", userId);
  if (error) return { error: error.message };

  return { error: null };
}
