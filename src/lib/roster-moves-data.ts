import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHomeRosterMoves } from "./home-roster-moves-data";
import type { LeaguePageBase } from "./league-page-data";
import { rosterMoveTabs, type RosterMoves, type RosterMoveTab } from "./league-triage";
import type { Database } from "./supabase/types";

// The Roster Moves switch as Picks and the Lifeline, Recast and Trades pages
// all show it, read the way the Home card reads the same moves, so the dot
// on a tab means the same thing everywhere. No tabs before the draft is
// complete.
export async function loadRosterMoveTabs(
  supabase: SupabaseClient<Database>,
  base: LeaguePageBase
): Promise<{ tabs: RosterMoveTab[]; moves: RosterMoves<string> }> {
  const { league, cutoff } = base;
  const moves = await loadHomeRosterMoves(supabase, {
    league,
    danceCardOn: base.danceCardOn,
    myTeamId: base.myTeamId,
    week: base.upcomingEpisode,
    spoiler: {
      behind: cutoff.pendingRevealEpisode != null,
      cutoffWeek: cutoff.effectiveLatestEpisode?.week_number ?? null,
      finaleWeekNumber: base.finaleWeekNumber,
    },
  });
  const on = {
    lifeline: base.danceCardOn && league.lifeline_enabled,
    recast: base.danceCardOn && base.waiversOn,
    trades: base.danceCardOn && base.tradesOn,
  };
  return { moves, tabs: league.draft_status === "completed" ? rosterMoveTabs(on, moves) : [] };
}
