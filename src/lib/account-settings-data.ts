import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AccountSettingsData = {
  displayName: string;
  isSuperAdmin: boolean;
  deletionRequestedAt: string | null;
  spoilerFreeMode: boolean;
};

// One query for everything TopBar's avatar and AccountSettingsSheet need,
// used by every top-level page — previously each page derived a subset of
// this differently (a dedicated profiles query on Home/This Week, a
// members-array lookup on the league page, is_super_admin only on
// /settings, deletion_requested_at only on /settings/account).
export async function getAccountSettingsData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountSettingsData> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, is_super_admin, deletion_requested_at, spoiler_free_mode")
    .eq("id", userId)
    .single();

  return {
    displayName: data?.display_name ?? "?",
    isSuperAdmin: data?.is_super_admin ?? false,
    deletionRequestedAt: data?.deletion_requested_at ?? null,
    spoilerFreeMode: data?.spoiler_free_mode ?? false,
  };
}
