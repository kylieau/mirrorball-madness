import { isOpenRosterStatus } from "./recast-framing";

export type LifelineRosterSlot = {
  slotNumber: number;
  coupleId: string;
  status: string;
  eliminationWeek: number | null;
  startWeek: number;
  endWeek: number | null;
};

// A spot to fill, with the couple it stands in for: the one holding it that
// went home, or for a spot nobody holds that week, the last one that did
// (null if none ever has).
export type LifelineSpot = { slotNumber: number; formerCoupleId: string | null };

export type LifelinePicksState = { kind: "none" } | { kind: "catch-up" } | { kind: "play"; spots: LifelineSpot[] };

// What Picks shows for the week's Lifeline. `slots` is every period the
// viewer's roster has had. A spot is open when no couple in it is still
// dancing that week, whatever emptied it (Kylie, 2026-11-19): its couple went
// home in an earlier week, or a trade took it and nothing has filled it.
// Mirrors lifeline_slot_is_dead(), so a manager who has never held a couple
// (one who joined after the draft) has every spot open. A viewer who is behind gets the same
// catch-up line whether or not a spot is open, so it gives nothing away; a
// viewer with none still gets the card once peers' picks are public.
export function lifelinePicksState({
  slots,
  rosterSize,
  weekNumber,
  behind,
  peersHavePicks,
}: {
  slots: LifelineRosterSlot[];
  rosterSize: number;
  weekNumber: number;
  behind: boolean;
  peersHavePicks: boolean;
}): LifelinePicksState {
  if (behind) return { kind: "catch-up" };
  const spots: LifelineSpot[] = [];
  for (let slotNumber = 1; slotNumber <= rosterSize; slotNumber++) {
    const periods = slots.filter((slot) => slot.slotNumber === slotNumber && slot.startWeek <= weekNumber);
    const current = periods.find((slot) => slot.endWeek === null || slot.endWeek >= weekNumber);
    if (current) {
      const gone = isOpenRosterStatus(current.status) && current.eliminationWeek != null && current.eliminationWeek < weekNumber;
      if (gone) spots.push({ slotNumber, formerCoupleId: current.coupleId });
      continue;
    }
    const last = periods.reduce<LifelineRosterSlot | null>((latest, slot) => (!latest || slot.endWeek! > latest.endWeek! ? slot : latest), null);
    spots.push({ slotNumber, formerCoupleId: last?.coupleId ?? null });
  }
  return spots.length > 0 || peersHavePicks ? { kind: "play", spots } : { kind: "none" };
}

export type LifelinePickChange = { slotNumber: number; coupleId: string | null };

// The order to send a manager's changed picks in. set_lifeline_pick refuses a
// couple the manager's other Lifeline holds, so spots trading couples are
// cleared before either is set.
export function lifelineSaveSteps(changes: LifelinePickChange[]): { clear: number[]; set: { slotNumber: number; coupleId: string }[] } {
  const set = changes.flatMap((change) => (change.coupleId ? [{ slotNumber: change.slotNumber, coupleId: change.coupleId }] : []));
  const cleared = changes.filter((change) => !change.coupleId).map((change) => change.slotNumber);
  return { clear: set.length > 1 ? changes.map((change) => change.slotNumber) : cleared, set };
}

export const LIFELINE_RULES = [
  "A Lifeline stands in for an open roster spot: one whose couple has gone home, or one a trade left empty. Each week, pick one couple still dancing that you don't hold, for each open spot.",
  "It pays half of that couple's Dance Card points for the week, whatever happens to them: a couple who goes home that week still pays, and a couple with a bye pays nothing.",
  "Picks lock at the week's Lifeline lock. Until then only you can see yours; once the week locks, the league's Lifelines are listed here.",
  "A spot that gets a new couple, from the waiver wire or a trade, stops needing a Lifeline from the week they start scoring.",
];
