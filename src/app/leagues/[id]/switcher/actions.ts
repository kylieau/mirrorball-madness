"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { loadHomeLeagueData } from "@/lib/home-league-data";
import { loadViewerMemberships } from "@/lib/viewer-season-data";

export type SwitcherSummary = { id: string; rank: number; totalMembers: number; picksDue: boolean };

// Rank and Picks Due for the viewer's other leagues, read only when the
// switcher sheet opens. Goes through Home's loader so a row here can't
// disagree with that league's card on Home. League ids come from the
// viewer's own memberships, never from the client.
export async function getSwitcherSummaries(
  currentLeagueId: string
): Promise<{ summaries: SwitcherSummary[]; error: null } | { summaries: null; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { summaries: null, error: "Not signed in" };

  const [memberships, { spoilerFreeMode }] = await Promise.all([
    loadViewerMemberships(supabase, user.id),
    getAccountSettingsData(supabase, user.id),
  ]);
  const others = memberships.flatMap((m) => (m.leagues && m.leagues.id !== currentLeagueId ? [m.leagues] : []));
  if (others.length === 0) return { summaries: [], error: null };

  const { summaries } = await loadHomeLeagueData(supabase, user.id, spoilerFreeMode, others);
  return {
    summaries: summaries.map((s) => ({ id: s.id, rank: s.rank, totalMembers: s.totalMembers, picksDue: s.picksDue })),
    error: null,
  };
}
