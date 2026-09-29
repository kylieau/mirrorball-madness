import { roundPoints } from "./format-points";
import { RESOLVING_OUTCOMES, type Outcome } from "./scoring";

// 1 is full weight. A commissioner may set anything from 0 through 1, to two
// decimals, matching numeric(3,2) on grand_finale_late_unlocks.
const LATE_FACTOR_PATTERN = /^\d+(\.\d{1,2})?$/;
const LATE_PERCENT_PATTERN = /^\d{1,3}$/;

export function parseLateFactor(raw: string): number | null {
  const trimmed = raw.trim();
  if (!LATE_FACTOR_PATTERN.test(trimmed)) return null;
  const value = roundPoints(Number(trimmed));
  if (value < 0 || value > 1) return null;
  return value;
}

// The sheet speaks in whole percents. The RPC and scoring still store late_factor as 0–1.
export function parseLatePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!LATE_PERCENT_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 100) return null;
  return value;
}

export function percentToLateFactor(percent: number): number {
  return roundPoints(percent / 100);
}

export function latePercent(factor: number): number {
  return Math.round(factor * 100);
}

export function formatLateFactor(factor: number): string {
  return factor.toFixed(2);
}

// 1 → "1.0", 0.5 → "0.5", 0.25 → "0.25". Score History uses this multiplier.
export function formatLateMultiplier(factor: number): string {
  const fixed = factor.toFixed(2);
  return fixed.endsWith("0") ? factor.toFixed(1) : fixed;
}

export function managerInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter((part) => part.length > 0);
  const letters = parts.map((part) => part[0]!.toUpperCase());
  if (letters.length === 0) return "?";
  return letters.slice(0, 2).join("");
}

// The manager's own bracket. Full weight still says Late; a penalty adds the percent.
export function lateEntryLabel(factor: number): string {
  return factor < 1 ? `Late · ${latePercent(factor)}%` : "Late";
}

export function lateEntryBanner(factor: number): string {
  return `Late entry · ${latePercent(factor)}% of Grand Finale`;
}

export function lateEntryNote(factor: number, phase: "open" | "locked"): string {
  const pct = latePercent(factor);
  const mult = formatLateMultiplier(factor);
  if (phase === "open") {
    if (factor < 1) {
      return `One-shot submit · scores at ${pct}% of Grand Finale (× ${mult} late on Score History).`;
    }
    return "One-shot submit · scores at 100% of Grand Finale (full credit).";
  }
  if (factor < 1) {
    return `Late entry · scores at ${pct}% of Grand Finale (× ${mult} late). Predictions are locked.`;
  }
  return "Late entry · full Grand Finale credit. Predictions are locked.";
}

// Peers only hear about a penalty. Full weight stays quiet.
export function latePenaltySuffix(factor: number): string {
  return factor < 1 ? `× ${formatLateMultiplier(factor)} late` : "";
}

export function allowLateButtonLabel(percent: number): string {
  return percent === 100 ? "Allow late entry" : `Allow late entry · ${percent}%`;
}

export function updateLateButtonLabel(percent: number): string {
  return `Update to ${percent}%`;
}

export function lateScoreHistoryHelper(percent: number): {
  percentLabel: string;
  detail: string;
  history: string;
} {
  const mult = formatLateMultiplier(percentToLateFactor(percent));
  if (percent >= 100) {
    return {
      percentLabel: "100% of Grand Finale",
      detail: "(full credit).",
      history: "Managers see × 1.0 late on Score History",
    };
  }
  return {
    percentLabel: `${percent}% of Grand Finale`,
    detail: `(× ${mult} late).`,
    history: `Managers see × ${mult} late on Score History`,
  };
}

export function isResolvedGrandFinaleStatus(status: string): boolean {
  return RESOLVING_OUTCOMES.has(status as Outcome);
}

export function resolvedCoupleCount(statuses: readonly string[]): number {
  return statuses.filter(isResolvedGrandFinaleStatus).length;
}

export const LATE_OUTCOMES_WARNING_TITLE = "Some outcomes already resolving";

export const LATE_OUTCOMES_OPT_IN =
  "I understand some couples are already resolved and still want to allow late entry";

export function lateUnlockWarning(resolvedCount: number): string | null {
  if (resolvedCount <= 0) return null;
  return "A few couples are already decided. Late picks can still be entered — this is not a hard block.";
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
