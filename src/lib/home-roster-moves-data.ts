import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { NO_ROSTER_MOVES, type RosterMoves } from "@/lib/league-triage";
import { lifelinePicksState } from "@/lib/lifeline-picks";
import { partitionRecastSlots } from "@/lib/recast-framing";
import { slotActiveInWeek } from "@/lib/roster-couple-points";
import { offerExpiresAt } from "@/lib/trades";
import { loadAllCouples } from "@/lib/viewer-season-data";

export type RosterMovesLeague = {
  id: string;
  draft_status: string;
  roster_size: number;
  lifeline_enabled: boolean;
  lifeline_starts_week: number | null;
  waiver_mode: string;
  trades_enabled: boolean;
};

// What the league card says under the viewer's Dance Card couples, by couple
// and manager id. It reads what Picks' Roster Moves card and the Trades page
// read, so the card agrees with them, and only the mechanisms the league has
// on cost a query.
export async function loadHomeRosterMoves(
  supabase: SupabaseClient<Database>,
  {
    league,
    danceCardOn,
    myTeamId,
    week,
    spoiler,
  }: {
    league: RosterMovesLeague | null;
    danceCardOn: boolean;
    myTeamId: string;
    // The week still to be scored, which is the one Lifeline plays in.
    week: { id: string; week_number: number } | null;
    spoiler: { behind: boolean; cutoffWeek: number | null; finaleWeekNumber: number | null };
  }
): Promise<RosterMoves<string>> {
  if (!league || !danceCardOn || league.draft_status !== "completed" || spoiler.behind) return NO_ROSTER_MOVES;
  const lifelineWeek =
    league.lifeline_enabled && week && week.week_number >= (league.lifeline_starts_week ?? Infinity) ? week : null;
  const waiversOn = league.waiver_mode === "waivers";
  const tradesOn = league.trades_enabled;
  if (!lifelineWeek && !waiversOn && !tradesOn) return NO_ROSTER_MOVES;

  const none = Promise.resolve({ data: null });
  const [
    { data: slotRows },
    couples,
    { data: lifelinePicks },
    { data: lifelineLockAt },
    { data: cycleRows },
    { data: claims },
    { data: offers },
    { data: tradeDeadline },
  ] = await Promise.all([
    supabase
      .from("roster_slots")
      .select("slot_number, couple_id, start_week, end_week")
      .eq("league_id", league.id)
      .eq("manager_id", myTeamId),
    loadAllCouples(supabase),
    lifelineWeek
      ? supabase
          .from("lifeline_picks")
          .select("slot_number, couple_id")
          .eq("league_id", league.id)
          .eq("week_id", lifelineWeek.id)
          .eq("manager_id", myTeamId)
      : none,
    lifelineWeek ? supabase.rpc("lifeline_lock_at", { p_league_id: league.id, p_week_id: lifelineWeek.id }) : none,
    waiversOn ? supabase.rpc("recast_next_cycle", { p_league_id: league.id }) : none,
    waiversOn
      ? supabase
          .from("waiver_claims")
          .select("couple_id, drop_couple_id")
          .eq("league_id", league.id)
          .eq("manager_id", myTeamId)
          .eq("status", "pending")
          .order("priority_order")
      : none,
    tradesOn
      ? supabase
          .from("trade_offers")
          .select("status, proposed_by, expires_at, trade_parties(manager_id, accepted_at)")
          .eq("league_id", league.id)
          .in("status", ["proposed", "accepted"])
          .order("created_at")
      : none,
    tradesOn ? supabase.rpc("trade_deadline", { p_league_id: league.id }) : none,
  ]);

  const coupleById = new Map(couples.map((couple) => [couple.id, couple]));
  const slots = (slotRows ?? []).flatMap((slot) => {
    const couple = slot.couple_id ? coupleById.get(slot.couple_id) : undefined;
    return couple
      ? [
          {
            slotNumber: slot.slot_number,
            coupleId: couple.id,
            status: couple.status,
            eliminationWeek: couple.elimination_week,
            period: { managerId: myTeamId, coupleId: couple.id, startWeek: slot.start_week, endWeek: slot.end_week },
          },
        ]
      : [];
  });
  const now = Date.now();

  const lifeline = ((): RosterMoves<string>["lifeline"] => {
    if (!lifelineWeek || !lifelinePicks) return null;
    const state = lifelinePicksState({
      slots: slots.filter((slot) => slotActiveInWeek(slot.period, lifelineWeek.week_number)),
      weekNumber: lifelineWeek.week_number,
      behind: false,
      peersHavePicks: false,
    });
    if (state.kind !== "play") return null;
    return {
      spots: state.slots.map((slot) => ({
        former: slot.coupleId,
        pick: lifelinePicks.find((pick) => pick.slot_number === slot.slotNumber)?.couple_id ?? null,
      })),
      weekNumber: lifelineWeek.week_number,
      lockAt: lifelineLockAt ?? null,
      locked: !!lifelineLockAt && now >= new Date(lifelineLockAt).getTime(),
    };
  })();

  const waivers = ((): RosterMoves<string>["waivers"] => {
    const cycle = cycleRows?.[0];
    if (cycle?.start_week == null || !claims) return null;
    const current = slots.filter((slot) => slot.period.endWeek === null);
    return {
      claims: claims.map((claim) => ({ add: claim.couple_id, drop: claim.drop_couple_id })),
      // A spot with no couple at all was emptied by a trade.
      openSpotCount:
        partitionRecastSlots(current, spoiler.cutoffWeek, spoiler.finaleWeekNumber).revealedOpen.length +
        Math.max(0, league.roster_size - current.length),
      dueAt: cycle.due_at as string | null,
      weekNumber: cycle.week_number,
      startWeek: cycle.start_week,
    };
  })();

  const trades = ((): RosterMoves<string>["trades"] => {
    if (!offers) return null;
    const mine = offers.filter((offer) => offer.trade_parties.some((party) => party.manager_id === myTeamId));
    return {
      // An offer lapses before the waiver run marks it expired, and once the
      // trade deadline has passed none can be accepted.
      offers: mine.flatMap((offer) => {
        const expiresAt = offerExpiresAt(offer.expires_at, tradeDeadline ?? null);
        const open = !!tradeDeadline && new Date(expiresAt).getTime() > now;
        const answered = offer.trade_parties.some((party) => party.manager_id === myTeamId && party.accepted_at);
        return offer.status === "proposed" && open && !answered ? [{ from: offer.proposed_by, expiresAt }] : [];
      }),
      acceptedWith: mine
        .filter((offer) => offer.status === "accepted")
        .map((offer) => offer.trade_parties.map((party) => party.manager_id).filter((id) => id !== myTeamId)),
    };
  })();

  return { lifeline, waivers, trades };
}
