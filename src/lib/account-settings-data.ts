import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadViewerMemberships } from "./viewer-season-data";

export type AccountSettingsLeague = { id: string; name: string; isCommissioner: boolean };

export type AccountSettingsData = {
  displayName: string;
  emailChangesEnabled?: boolean;
  isSuperAdmin: boolean;
  deletionRequestedAt: string | null;
  spoilerFreeMode: boolean;
  leagues: AccountSettingsLeague[];
  // Global results contributors are explicitly approved by a site admin.
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
  const [{ data, error }, memberships] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, is_super_admin, deletion_requested_at, spoiler_free_mode, can_propose_results")
      .eq("id", userId)
      .single(),
    loadViewerMemberships(supabase, userId),
  ]);

  if (error || !data) throw new Error("Could not load account preferences. Please try again.");

  const isSuperAdmin = data?.is_super_admin ?? false;
  const leagues = memberships
    .filter((m) => m.leagues)
    .map((m) => ({ id: m.leagues!.id, name: m.leagues!.name, isCommissioner: m.role === "commissioner" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    emailChangesEnabled: process.env.AUTH_EMAIL_ENABLED === "true",
    displayName: data?.display_name ?? "?",
    isSuperAdmin,
    deletionRequestedAt: data?.deletion_requested_at ?? null,
    spoilerFreeMode: data?.spoiler_free_mode ?? false,
    leagues,
    canProposeResults: isSuperAdmin || data.can_propose_results === true,
  };
}
