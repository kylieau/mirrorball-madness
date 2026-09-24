import { roundPoints } from "./format-points";
import {
  DANCE_CARD_PLACEMENT_KEY,
  NO_SURVIVAL_OUTCOMES,
  RESOLVING_OUTCOMES,
  classifyEliminationGuess,
  classifyTopScorerGuess,
  computeGrandFinalePoints,
  couplesRemainingAtWeek,
  curtainCallPayout,
  eliminationPositionRanges,
  findEliminatedCoupleIds,
  resolveCurtainCallGuess,
  sumDanceScoresByCouple,
  type CategoryWeights,
  type CurtainCallVerdict,
  type DanceScore,
  type GrandFinaleMethod,
  type Outcome,
  type ScoringSettings,
  type TierPayStyle,
} from "./scoring";
import type { ScoringModuleKey } from "./scoring-modules";
import { slotActiveInWeek, type RosterSlotPeriod } from "./roster-couple-points";

export type HistoryModule = ScoringModuleKey;
export type ScoreHistoryLine = {
  id: string;
  weekNumber: number;
  module: HistoryModule;
  label: string;
  // The verdict shown after the label ("✓", "Exact", "Off 2"); HIT_MARK gets
  // the app's green check styling.
  result?: string;
  points: number;
};

export type HistoryWeekData = {
  weekNumber: number;
  isDoubleElimination: boolean;
  danceScores: DanceScore[];
  // Every episode's result rows for the week, in episode order: like the
  // scoring engine, the last row per couple decides survival and bonus.
  outcomes: { coupleId: string; outcome: Outcome; bonusPoints: number }[];
  inJeopardyCoupleIds: string[];
};

export type ManagerHistoryInput = {
  scoring: ScoringSettings;
  anchorWeek: number;
  categoryWeights: CategoryWeights;
  grandFinale: {
    method: GrandFinaleMethod;
    distancePenalty: number | null;
    tierSize: number | null;
    tierPayStyle: TierPayStyle;
    pointsPerCorrect: number;
  };
  couples: { id: string; status: string; elimination_week: number | null }[];
  coupleNames: Map<string, string>;
  weeks: HistoryWeekData[];
  rosterSlots: RosterSlotPeriod[];
  predictions: {
    weekNumber: number;
    eliminatedCoupleId: string | null;
    eliminatedCoupleId2: string | null;
    topScorerCoupleId: string | null;
  }[];
  grandFinalePredictions: { coupleId: string; predictedPosition: number }[];
  // Every week of the season with its *planned* eliminations. Doubles are only
  // known once an episode airs, so this is just the default shape; weeks the
  // viewer can see use the real count instead (see effectiveSchedule).
  weekSchedule: WeekSlots[];
};

export type WeekSlots = { weekNumber: number; eliminations: number };

// Turns an elimination-order spot into the week that spot is planned for by
// walking the schedule: a double-elimination week holds two spots, a week
// with no elimination none. Spots past the last elimination are the finale,
// which returns null.
export function plannedEliminationWeek(position: number, schedule: WeekSlots[]): number | null {
  let slotsSoFar = 0;
  for (const week of [...schedule].sort((a, b) => a.weekNumber - b.weekNumber)) {
    slotsSoFar += week.eliminations;
    if (position <= slotsSoFar) return week.weekNumber;
  }
  return null;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

function trimNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function weightSuffix(weight: number): string {
  return weight === 1 ? "" : ` × ${trimNumber(weight)} Wt`;
}

export const HIT_MARK = "✓";

function verdictLabel(verdict: CurtainCallVerdict): string {
  return verdict === "exact" ? HIT_MARK : "🤏";
}

// Reconstructs one manager's nonzero point-contribution lines from the same
// helpers and inputs the scoring engine uses — no stored ledger. Lines carry
// the category weight, so they sum (within rounding) to the weighted module
// totals; the stored totals stay authoritative where they differ.
export function buildScoreHistory(input: ManagerHistoryInput): ScoreHistoryLine[] {
  const { scoring, categoryWeights, grandFinale, couples, coupleNames } = input;
  const totalCouples = couples.length;
  const positionRanges = eliminationPositionRanges(couples);
  const visibleWeeks = new Set(input.weeks.map((week) => week.weekNumber));
  const effectiveSchedule = input.weekSchedule.map((slot) =>
    visibleWeeks.has(slot.weekNumber)
      ? {
          weekNumber: slot.weekNumber,
          eliminations: couples.filter(
            (c) => (c.status === "eliminated" || c.status === "withdrawn") && c.elimination_week === slot.weekNumber
          ).length,
        }
      : slot
  );
  const nameOf = (coupleId: string | null) => (coupleId && coupleNames.get(coupleId)) || "Unknown";
  const lines: ScoreHistoryLine[] = [];

  const push = (
    weekNumber: number,
    module: HistoryModule,
    key: string,
    label: string,
    rawPoints: number,
    weight: number,
    result?: string
  ) => {
    const points = roundPoints(rawPoints * weight);
    if (points === 0) return;
    lines.push({
      id: `${module}:${weekNumber}:${key}`,
      weekNumber,
      module,
      label: `${label}${weightSuffix(weight)}`,
      result,
      points,
    });
  };

  // Weeks before the league's Anchor Week pay nothing in any module.
  for (const week of [...input.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const w = week.weekNumber;
    if (w < input.anchorWeek) continue;
    const totals = sumDanceScoresByCouple(week.danceScores);
    const lastOutcome = new Map(week.outcomes.map((o) => [o.coupleId, o]));
    const resolvedThisWeek = [...lastOutcome.values()]
      .filter((o) => RESOLVING_OUTCOMES.has(o.outcome) && positionRanges.has(o.coupleId));

    const prediction = input.predictions.find((p) => p.weekNumber === w);
    if (prediction) {
      const eliminatedIds = findEliminatedCoupleIds(week.outcomes);
      const inJeopardyIds = new Set(week.inJeopardyCoupleIds);
      const couplesRemaining = couplesRemainingAtWeek(
        couples.map((c) => ({ eliminationWeek: c.elimination_week })),
        w
      );
      const eliminationExact = curtainCallPayout(scoring.eliminationPredictionPoints, couplesRemaining, totalCouples);
      const topScorerExact = curtainCallPayout(scoring.topScorerPredictionPoints, couplesRemaining, totalCouples);
      const weight = categoryWeights.eliminations;

      const picks: { key: string; tag: string; coupleId: string | null; verdict: CurtainCallVerdict; exact: number }[] = [
        {
          key: "elim1",
          tag: "Home",
          coupleId: prediction.eliminatedCoupleId,
          verdict: classifyEliminationGuess(prediction.eliminatedCoupleId, eliminatedIds, inJeopardyIds),
          exact: eliminationExact,
        },
      ];
      if (week.isDoubleElimination) {
        picks.push({
          key: "elim2",
          tag: "Home",
          coupleId: prediction.eliminatedCoupleId2,
          verdict: classifyEliminationGuess(prediction.eliminatedCoupleId2, eliminatedIds, inJeopardyIds),
          exact: eliminationExact,
        });
      }
      picks.push({
        key: "top",
        tag: "High",
        coupleId: prediction.topScorerCoupleId,
        verdict: classifyTopScorerGuess(prediction.topScorerCoupleId, totals),
        exact: topScorerExact,
      });

      for (const pick of picks) {
        const resolved = resolveCurtainCallGuess(pick.verdict, pick.exact, scoring.curtainCallNearMissEnabled);
        push(
          w,
          "curtainCall",
          pick.key,
          `${pick.tag}: ${nameOf(pick.coupleId)}`,
          resolved.points,
          weight,
          verdictLabel(resolved.verdict)
        );
      }
    }

    const weight = categoryWeights.judges;
    for (const slot of input.rosterSlots) {
      if (!slotActiveInWeek(slot, w)) continue;
      const name = nameOf(slot.coupleId);
      const outcome = lastOutcome.get(slot.coupleId);

      const judgesTotal = totals.get(slot.coupleId) ?? 0;
      push(
        w,
        "danceCard",
        `judges:${slot.coupleId}`,
        `${name}: Jdg ${trimNumber(judgesTotal)} × ${trimNumber(scoring.judgesScoreMultiplier)}`,
        judgesTotal * scoring.judgesScoreMultiplier,
        weight
      );

      if (outcome && !NO_SURVIVAL_OUTCOMES.has(outcome.outcome)) {
        push(w, "danceCard", `survival:${slot.coupleId}`, `${name}: Survival`, scoring.survivalPoints, weight);
      }

      const range = outcome && RESOLVING_OUTCOMES.has(outcome.outcome) ? positionRanges.get(slot.coupleId) : undefined;
      const placement = range ? totalCouples - range.start + 1 : null;
      if (placement !== null && placement in DANCE_CARD_PLACEMENT_KEY) {
        push(
          w,
          "danceCard",
          `placement:${slot.coupleId}`,
          `Season Podium: ${name}, ${ORDINALS[placement - 1]} Place`,
          scoring[DANCE_CARD_PLACEMENT_KEY[placement]],
          weight
        );
      }

      if (outcome) {
        push(w, "danceCard", `bonus:${slot.coupleId}`, `${name}: Bonus`, outcome.bonusPoints, weight);
      }
    }

    for (const resolved of resolvedThisWeek) {
      const prediction = input.grandFinalePredictions.find((p) => p.coupleId === resolved.coupleId);
      const range = positionRanges.get(resolved.coupleId);
      if (!prediction || !range) continue;
      const raw =
        computeGrandFinalePoints({
          predictions: [{ managerId: "m", coupleId: prediction.coupleId, predictedPosition: prediction.predictedPosition }],
          resolvedCouples: [{ coupleId: resolved.coupleId, actualPosition: range.start, actualPositionEnd: range.end }],
          totalCouples,
          ...grandFinale,
        }).m ?? 0;
      const plannedWeek = plannedEliminationWeek(prediction.predictedPosition, effectiveSchedule);
      const spotsOff = Math.max(range.start - prediction.predictedPosition, prediction.predictedPosition - range.end, 0);
      push(
        w,
        "grandFinale",
        `gf:${resolved.coupleId}`,
        `${nameOf(resolved.coupleId)}: ${plannedWeek === null ? "Finale" : `Elim W${plannedWeek}`}`,
        raw,
        categoryWeights.bonus,
        spotsOff === 0 ? "Exact" : `Off ${spotsOff}`
      );
    }
  }

  return lines;
}

export type HistoryRow = ScoreHistoryLine & { run: number };
export type HistoryWeekGroup = { weekNumber: number; rows: HistoryRow[] };

// Newest week first; within a week, lines stay in the order they were earned
// (Curtain Call, Dance Card, Grand Finale). `run` accumulates oldest to newest
// over the lines that pass the filter, so it is the season total for All and
// the selected modules' combined total otherwise. No modules selected means all.
export function groupHistory(lines: ScoreHistoryLine[], modules: HistoryModule[]): HistoryWeekGroup[] {
  const groups = new Map<number, HistoryRow[]>();
  let run = 0;
  for (const line of lines) {
    if (modules.length > 0 && !modules.includes(line.module)) continue;
    run = roundPoints(run + line.points);
    groups.set(line.weekNumber, [...(groups.get(line.weekNumber) ?? []), { ...line, run }]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([weekNumber, rows]) => ({ weekNumber, rows }));
}
