import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaguePageBase } from "./league-page-data";
import { lifelinePicksState } from "./lifeline-picks";
import { slotActiveInWeek } from "./roster-couple-points";
import type { Database } from "./supabase/types";

export type LifelineWeek = NonNullable<Awaited<ReturnType<typeof loadLifelineWeek>>>;

// The week's Lifeline as the viewer may see it, shared by Picks and the
// Lifeline page. Lifeline plays in the week still to be scored, once the
// league's first Lifeline week has come; null when there is no such week.
export async function loadLifelineWeek(supabase: SupabaseClient<Database>, base: LeaguePageBase) {
  const { league, upcomingEpisode: week, myTeamId } = base;
  if (
    !base.danceCardOn ||
    !league.lifeline_enabled ||
    league.draft_status !== "completed" ||
    !week ||
    week.week_number < (league.lifeline_starts_week ?? Infinity)
  ) {
    return null;
  }

  const [{ data: pickRows }, { data: lockAt }] = await Promise.all([
    // RLS returns the viewer's own picks before the lock and the league's after it.
    supabase
      .from("lifeline_picks")
      .select("manager_id, slot_number, couple_id")
      .eq("league_id", league.id)
      .eq("week_id", week.id)
      .order("slot_number"),
    supabase.rpc("lifeline_lock_at", { p_league_id: league.id, p_week_id: week.id }),
  ]);

  const locked = !!lockAt && new Date() >= new Date(lockAt);
  const couplesById = new Map(base.flatCouples.map((couple) => [couple.id, couple]));
  const rosterSlots = base.rosterSlotPeriods
    .filter((slot) => slot.managerId === myTeamId && slotActiveInWeek(slot, week.week_number))
    .flatMap((slot) => {
      const couple = couplesById.get(slot.coupleId);
      return couple
        ? [{ slotNumber: slot.slotNumber, coupleId: slot.coupleId, status: couple.status, eliminationWeek: couple.elimination_week }]
        : [];
    });
  const peerPicks = (pickRows ?? []).filter((row) => row.manager_id !== myTeamId);
  const state = lifelinePicksState({
    slots: rosterSlots,
    weekNumber: week.week_number,
    behind: base.cutoff.pendingRevealEpisode != null,
    peersHavePicks: locked && peerPicks.length > 0,
  });
  const heldCoupleIds = new Set(rosterSlots.map((slot) => slot.coupleId));

  return {
    week: { id: week.id, weekNumber: week.week_number, isFinale: week.week_number === base.finaleWeekNumber },
    lockAt: lockAt ?? null,
    locked,
    // False when the saved picks couldn't be read, so nothing claims "none saved".
    picksRead: pickRows != null,
    state: state.kind,
    // The viewer's dead roster spots, each with the Lifeline saved for it.
    slots:
      state.kind === "play"
        ? state.slots.map((slot) => ({
            slotNumber: slot.slotNumber,
            formerCoupleId: slot.coupleId,
            pickCoupleId:
              (pickRows ?? []).find((row) => row.manager_id === myTeamId && row.slot_number === slot.slotNumber)
                ?.couple_id ?? null,
          }))
        : [],
    // Couples still dancing that the viewer doesn't hold.
    couples: base.activeCouples
      .filter((couple) => !heldCoupleIds.has(couple.id))
      .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name))
      .map((couple) => ({ id: couple.id })),
    leagueEntries: base.standings
      .filter((manager) => manager.managerId !== myTeamId)
      .map((manager) => ({
        managerId: manager.managerId,
        displayName: manager.displayName,
        coupleIds: peerPicks.filter((row) => row.manager_id === manager.managerId).map((row) => row.couple_id),
      }))
      .filter((entry) => entry.coupleIds.length > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}
