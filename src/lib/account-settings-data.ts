import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AccountSettingsLeague = { id: string; name: string; isCommissioner: boolean };

export type AccountSettingsData = {
  displayName: string;
  isSuperAdmin: boolean;
  deletionRequestedAt: string | null;
  spoilerFreeMode: boolean;
  leagues: AccountSettingsLeague[];
  // The propose tier: can this viewer draft episode results? Derived from the
  // leagues above rather than a second query — commissioner of any one of them
  // is enough. Viewing results needs no flag at all; it's open to everyone.
  canProposeResults: boolean;
};

// One fetch for everything TopBar's avatar and AccountSettingsSheet need
// (including the leagues listed under "League Settings"),
// used by every top-level page — previously each page derived a subset of
// this differently (a dedicated profiles query on Home/This Week, a
// members-array lookup on the league page, is_super_admin only on
// /settings, deletion_requested_at only on /settings/account).
export async function getAccountSettingsData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountSettingsData> {
  const [{ data }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, is_super_admin, deletion_requested_at, spoiler_free_mode")
      .eq("id", userId)
      .single(),
    // A co-manager's auth uid never appears as user_id — it's on
    // co_manager_id — so both must be checked or a co-manager sees zero
    // leagues under Account Settings.
    supabase
      .from("league_members")
      .select("role, leagues(id, name)")
      .or(`user_id.eq.${userId},co_manager_id.eq.${userId}`),
  ]);

  const isSuperAdmin = data?.is_super_admin ?? false;
  const leagues = (memberships ?? [])
    .filter((m) => m.leagues)
    .map((m) => ({ id: m.leagues!.id, name: m.leagues!.name, isCommissioner: m.role === "commissioner" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    displayName: data?.display_name ?? "?",
    isSuperAdmin,
    deletionRequestedAt: data?.deletion_requested_at ?? null,
    spoilerFreeMode: data?.spoiler_free_mode ?? false,
    leagues,
    canProposeResults: isSuperAdmin || leagues.some((league) => league.isCommissioner),
  };
}
