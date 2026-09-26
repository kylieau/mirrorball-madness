import { roundPoints } from "./format-points";
import { RESOLVING_OUTCOMES, type Outcome } from "./scoring";

// 1 is full weight. A commissioner may set anything from 0 through 1, to two
// decimals, matching numeric(3,2) on grand_finale_late_unlocks.
const LATE_FACTOR_PATTERN = /^\d+(\.\d{1,2})?$/;

export function parseLateFactor(raw: string): number | null {
  const trimmed = raw.trim();
  if (!LATE_FACTOR_PATTERN.test(trimmed)) return null;
  const value = roundPoints(Number(trimmed));
  if (value < 0 || value > 1) return null;
  return value;
}

export function formatLateFactor(factor: number): string {
  return factor.toFixed(2);
}

// The manager's own bracket. Full weight still says Late; a penalty adds the factor.
export function lateEntryLabel(factor: number): string {
  return factor < 1 ? `Late · ${formatLateFactor(factor)}` : "Late";
}

export function lateEntryNote(factor: number, phase: "open" | "locked"): string {
  const weight = factor < 1 ? ` at ${formatLateFactor(factor)} weight` : "";
  if (phase === "open") return `Late entry${weight}. One save, then it locks.`;
  return `Late entry${weight}. Predictions are locked.`;
}

// Peers only hear about a penalty. Full weight stays quiet.
export function latePenaltySuffix(factor: number): string {
  return factor < 1 ? `Late ${formatLateFactor(factor)}` : "";
}

export function isResolvedGrandFinaleStatus(status: string): boolean {
  return RESOLVING_OUTCOMES.has(status as Outcome);
}

export function resolvedCoupleCount(statuses: readonly string[]): number {
  return statuses.filter(isResolvedGrandFinaleStatus).length;
}

export function lateUnlockWarning(resolvedCount: number): string | null {
  if (resolvedCount <= 0) return null;
  const couples =
    resolvedCount === 1 ? "1 couple already has" : `${resolvedCount} couples already have`;
  const they = resolvedCount === 1 ? "That couple will not earn points" : "Those couples will not earn points";
  return `${couples} a Grand Finale outcome. ${they} on this late bracket. Only couples still remaining when the bracket is saved can earn points, at this late factor.`;
}

export type GrandFinaleLateUnlock = {
  lateFactor: number;
  ineligibleCoupleIds: ReadonlySet<string>;
};

export function eligibleGrandFinalePredictions<T extends { managerId: string; coupleId: string }>(
  predictions: readonly T[],
  lateByManager: ReadonlyMap<string, GrandFinaleLateUnlock>
): T[] {
  return predictions.filter((p) => !lateByManager.get(p.managerId)?.ineligibleCoupleIds.has(p.coupleId));
}

// Scales the raw Grand Finale total. Category weight is applied later, so the
// stored points stay unweighted and the paid total is raw × weight × late_factor.
export function scaleGrandFinaleLateFactors(
  pointsByManager: Record<string, number>,
  lateByManager: ReadonlyMap<string, Pick<GrandFinaleLateUnlock, "lateFactor">>
): Record<string, number> {
  const scaled: Record<string, number> = {};
  for (const [managerId, points] of Object.entries(pointsByManager)) {
    const factor = lateByManager.get(managerId)?.lateFactor ?? 1;
    scaled[managerId] = roundPoints(points * factor);
  }
  return scaled;
}
