import { isOpenRosterStatus } from "./recast-framing";

export type LifelineRosterSlot = {
  slotNumber: number;
  coupleId: string;
  status: string;
  eliminationWeek: number | null;
};

export type LifelinePicksState<S> = { kind: "none" } | { kind: "catch-up" } | { kind: "play"; slots: S[] };

// What Picks shows for the week's Lifeline. `slots` is the viewer's roster as
// it stands in that week. A viewer who is behind gets the same catch-up line
// whether or not one of their spots is dead, so it gives nothing away; a
// viewer with no dead spot still gets the card once peers' picks are public.
export function lifelinePicksState<S extends LifelineRosterSlot>({
  slots,
  weekNumber,
  behind,
  peersHavePicks,
}: {
  slots: S[];
  weekNumber: number;
  behind: boolean;
  peersHavePicks: boolean;
}): LifelinePicksState<S> {
  if (slots.length === 0) return { kind: "none" };
  if (behind) return { kind: "catch-up" };
  const dead = slots.filter(
    (slot) => isOpenRosterStatus(slot.status) && slot.eliminationWeek != null && slot.eliminationWeek < weekNumber
  );
  return dead.length > 0 || peersHavePicks ? { kind: "play", slots: dead } : { kind: "none" };
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
