import { spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";

const OPEN_ROSTER_STATUSES = new Set(["eliminated", "withdrawn"]);

export type RosterOccupancy = "occupied" | "revealed-open" | "hidden-open";

export function isOpenRosterStatus(status: string): boolean {
  return OPEN_ROSTER_STATUSES.has(status);
}

// A slot is physically open when the current occupant is gone. Spoiler-Free
// hides that until the elim week is in cutoff (same clamp as roster tags) so
// Recast copy cannot name who went home or say they are "out" early.
export function classifyRosterOccupancy(
  couple: { status: string; eliminationWeek: number | null },
  cutoffWeek: number | null,
  finaleWeekNumber: number | null
): RosterOccupancy {
  if (!isOpenRosterStatus(couple.status)) return "occupied";
  const visible = spoilerSafeCoupleStatus(couple, cutoffWeek, finaleWeekNumber);
  return isOpenRosterStatus(visible) ? "revealed-open" : "hidden-open";
}

export function partitionRecastSlots<T extends { status: string; eliminationWeek: number | null }>(
  slots: T[],
  cutoffWeek: number | null,
  finaleWeekNumber: number | null
): { revealedOpen: T[]; hiddenOpenCount: number } {
  const revealedOpen: T[] = [];
  let hiddenOpenCount = 0;
  for (const slot of slots) {
    const occupancy = classifyRosterOccupancy(slot, cutoffWeek, finaleWeekNumber);
    if (occupancy === "revealed-open") revealedOpen.push(slot);
    else if (occupancy === "hidden-open") hiddenOpenCount += 1;
  }
  return { revealedOpen, hiddenOpenCount };
}
