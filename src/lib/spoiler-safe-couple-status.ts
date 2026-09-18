const PODIUM_STATUSES = new Set(["winner", "runner_up", "third_place"]);
const RESOLVING_STATUSES = new Set(["eliminated", "withdrawn", "winner", "runner_up", "third_place"]);

// Uniform clamp to "active" for any status that hasn't been revealed yet —
// deliberately no distinct "pending" tag, since a differential tag applied
// only to the couple whose status actually changed would itself leak which
// couple got hit before the user watches anything (see the plan's mockup
// review finding). Every clamped couple renders indistinguishably from a
// genuinely still-competing one.
export function spoilerSafeCoupleStatus(
  couple: { status: string; eliminationWeek: number | null },
  cutoffWeek: number | null,
  finaleWeekNumber: number | null
): string {
  if (!RESOLVING_STATUSES.has(couple.status)) return couple.status;

  // Podium placements (winner/runner-up/third) only resolve at the finale
  // broadcast itself, regardless of when the couple's last dance was.
  const resolvingWeek = PODIUM_STATUSES.has(couple.status) ? finaleWeekNumber : couple.eliminationWeek;

  if (cutoffWeek === null || resolvingWeek === null || resolvingWeek > cutoffWeek) {
    return "active";
  }

  return couple.status;
}

export function isSpoilerSafeActive(
  couple: { status: string; eliminationWeek: number | null },
  cutoffWeek: number | null,
  finaleWeekNumber: number | null
): boolean {
  return spoilerSafeCoupleStatus(couple, cutoffWeek, finaleWeekNumber) === "active";
}
