import { roundPoints } from "./format-points";
import { latePenaltySuffix } from "./grand-finale-late";
import {
  DANCE_CARD_PLACEMENT_KEY,
  finalPlacementFromRange,
  NO_SURVIVAL_OUTCOMES,
  RESOLVING_OUTCOMES,
  classifyEliminationGuess,
  classifyTopScorerGuess,
  collapseToNights,
  computeGrandFinalePoints,
  couplesRemainingAtWeek,
  curtainCallPayout,
  eliminationPositionRanges,
  findEliminatedCoupleIds,
  resolveCurtainCallGuess,
  sumDanceScoresByCouple,
  nightScaledScoresByCouple,
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
import { danceCardLedger, judgesCents, ledgerEntry, type DanceCardRule } from "./dance-card-v2";

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

type EpisodeRows<T> = ({ episode_id: string } & T)[];

// One competition week's dance scores and result rows, in episode order (the
// last result row per couple decides survival and bonus, as in the engine).
export function weekResults(
  episodeIds: string[],
  danceRows: EpisodeRows<{ couple_id: string; total_score: number; scaled_score: number; max_score: number | null; team_id?: string | null }>,
  outcomeRows: EpisodeRows<{ couple_id: string; outcome: string; bonus_points: number }>
): Pick<HistoryWeekData, "danceScores" | "outcomes"> {
  const inWeek = new Set(episodeIds);
  const episodeOrder = new Map(episodeIds.map((id, index) => [id, index]));
  return {
    danceScores: danceRows
      .filter((row) => inWeek.has(row.episode_id))
      .map((row) => ({
        episodeId: row.episode_id,
        coupleId: row.couple_id,
        totalScore: Number(row.total_score),
        scaledScore: Number(row.scaled_score),
        maxScore: row.max_score == null ? null : Number(row.max_score),
        teamId: row.team_id ?? null,
      })),
    outcomes: outcomeRows
      .filter((row) => inWeek.has(row.episode_id))
      .sort((a, b) => episodeOrder.get(a.episode_id)! - episodeOrder.get(b.episode_id)!)
      .map((row) => ({
        coupleId: row.couple_id,
        outcome: row.outcome as Outcome,
        bonusPoints: Number(row.bonus_points),
      })),
  };
}

export type ManagerHistoryInput = {
  scoring: ScoringSettings;
  // v1 when absent. Under v2 each couple-week is one line, its credit.
  danceCardRule?: DanceCardRule;
  // v2 only: the weeks as the ledger reads them, when a week still posting
  // shows fewer nights than its credit covers (a published sibling night).
  danceCardWeeks?: Pick<HistoryWeekData, "weekNumber" | "danceScores" | "outcomes">[];
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
  // Set only for a bracket submitted through a late unlock. Couples already
  // resolved at that submit never pay. Factor 1 is full weight and stays quiet.
  grandFinaleLateFactor?: number;
  grandFinaleIneligibleCoupleIds?: ReadonlySet<string>;
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

// Each couple's week as Score History labels it: the TV total and, for a
// guest-judge or multi-dance night, the 30-point basis it pays on
// ("Jdg 64→24"); bonus-round points sit beside the marks ("Jdg 64+3→25.13").
function weekJudgesLabels(danceScores: HistoryWeekData["danceScores"]): Map<string, { label: string; scaled: number }> {
  const totals = sumDanceScoresByCouple(danceScores);
  const scaledTotals = nightScaledScoresByCouple(danceScores);
  const bonusTotals = new Map<string, number>();
  for (const night of collapseToNights(danceScores)) {
    bonusTotals.set(night.coupleId, (bonusTotals.get(night.coupleId) ?? 0) + night.bonusScore);
  }
  return new Map(
    [...totals].map(([coupleId, rawTotal]) => {
      const scaled = scaledTotals.get(coupleId) ?? 0;
      const bonus = bonusTotals.get(coupleId) ?? 0;
      const rawLabel = bonus !== 0 ? `${trimNumber(rawTotal - bonus)}+${trimNumber(bonus)}` : trimNumber(rawTotal);
      return [coupleId, { label: rawTotal === scaled && bonus === 0 ? trimNumber(scaled) : `${rawLabel}→${trimNumber(scaled)}`, scaled }];
    })
  );
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
  const danceCardRule = input.danceCardRule ?? { version: "v1" };
  const ledgerWeeks = input.danceCardWeeks ?? input.weeks;
  const ledger = danceCardRule.version !== "v1" ? danceCardLedger(ledgerWeeks, input.anchorWeek, danceCardRule) : null;

  const push = (
    weekNumber: number,
    module: HistoryModule,
    key: string,
    label: string,
    rawPoints: number,
    weight: number,
    result?: string,
    lateFactor = 1
  ) => {
    const points = roundPoints(rawPoints * weight * lateFactor);
    if (points === 0) return;
    const penalty = latePenaltySuffix(lateFactor);
    lines.push({
      id: `${module}:${weekNumber}:${key}`,
      weekNumber,
      module,
      label: `${label}${weightSuffix(weight)}${penalty ? ` · ${penalty}` : ""}`,
      result,
      points,
    });
  };

  // Weeks before the league's Anchor Week pay nothing in any module.
  for (const week of [...input.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const w = week.weekNumber;
    if (w < input.anchorWeek) continue;
    const totals = sumDanceScoresByCouple(week.danceScores);
    const judgesLabels = weekJudgesLabels(week.danceScores);
    const ledgerLabels = ledger
      ? weekJudgesLabels(ledgerWeeks.find((lw) => lw.weekNumber === w)?.danceScores ?? week.danceScores)
      : judgesLabels;
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

      // v3 reads like v1: judges at the league's rate, then survival and the
      // Fantasy Bonus on their own lines, each the ledger's own cents.
      if (ledger && danceCardRule.version === "v3") {
        const entry = ledgerEntry(ledger, slot.coupleId, w);
        if (entry) {
          const judges = ledgerLabels.get(slot.coupleId) ?? { label: "0", scaled: 0 };
          push(w, "danceCard", `judges:${slot.coupleId}`, `${name}: Jdg ${judges.label} × ${trimNumber(danceCardRule.rate)}`, judgesCents(entry) / 100, weight);
          push(w, "danceCard", `survival:${slot.coupleId}`, `${name}: Survival`, entry.survivalCents / 100, weight);
          push(w, "danceCard", `bonus:${slot.coupleId}`, `${name}: Bonus`, entry.bonusCents / 100, weight);
        }
        continue;
      }
      // v2 reads like v1: the week's credit over its input is that week's
      // rate, and a Fantasy Bonus keeps its own line at the same rate.
      if (ledger) {
        const entry = ledgerEntry(ledger, slot.coupleId, w);
        if (entry && entry.input !== 0) {
          const judges = ledgerLabels.get(slot.coupleId) ?? { label: "0", scaled: 0 };
          const credit = entry.creditCents / 100;
          const rate = credit / entry.input;
          const bonusPoints = roundPoints((entry.input - judges.scaled) * rate);
          push(w, "danceCard", `judges:${slot.coupleId}`, `${name}: Jdg ${judges.label} × ${trimNumber(rate)}`, credit - bonusPoints, weight);
          push(w, "danceCard", `bonus:${slot.coupleId}`, `${name}: Bonus`, bonusPoints, weight);
        }
        continue;
      }
      const judges = judgesLabels.get(slot.coupleId) ?? { label: "0", scaled: 0 };
      push(
        w,
        "danceCard",
        `judges:${slot.coupleId}`,
        `${name}: Jdg ${judges.label} × ${trimNumber(scoring.judgesScoreMultiplier)}`,
        judges.scaled * scoring.judgesScoreMultiplier,
        weight
      );

      if (outcome && !NO_SURVIVAL_OUTCOMES.has(outcome.outcome)) {
        push(w, "danceCard", `survival:${slot.coupleId}`, `${name}: Survival`, scoring.survivalPoints, weight);
      }

      const range = outcome && RESOLVING_OUTCOMES.has(outcome.outcome) ? positionRanges.get(slot.coupleId) : undefined;
      const placement = range ? finalPlacementFromRange(range, totalCouples) : null;
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

    const lateFactor = input.grandFinaleLateFactor ?? 1;
    const ineligible = input.grandFinaleIneligibleCoupleIds;
    for (const resolved of resolvedThisWeek) {
      if (ineligible?.has(resolved.coupleId)) continue;
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
        spotsOff === 0 ? "Exact" : `Off ${spotsOff}`,
        lateFactor
      );
    }
  }

  return lines;
}

export type HistoryRow = ScoreHistoryLine & { run: number };
export type HistoryWeekGroup = { weekNumber: number; rows: HistoryRow[] };

export type LifelineHistoryInput = {
  // The Dance Card category weight the stored amounts were weighted by.
  weight: number;
  payouts: { weekNumber: number; slotNumber: number; coupleId: string; weightedPoints: number }[];
  equalizers: { weekNumber: number; weightedPoints: number; weeks: number[] }[];
};

// Lifeline's lines come from its stored rows, not the engine: a payout per
// pick that paid, and the Equalizer in the week it landed on. They join the
// Dance Card lines of their week.
export function withLifelineLines(
  lines: ScoreHistoryLine[],
  lifeline: LifelineHistoryInput,
  coupleNames: Map<string, string>
): ScoreHistoryLine[] {
  const added: ScoreHistoryLine[] = [
    ...lifeline.payouts.map((payout) => ({
      id: `lifeline:${payout.weekNumber}:${payout.slotNumber}`,
      weekNumber: payout.weekNumber,
      module: "danceCard" as const,
      label: `Lifeline: ${coupleNames.get(payout.coupleId) ?? "Unknown"} survives${weightSuffix(lifeline.weight)}`,
      points: payout.weightedPoints,
    })),
    ...lifeline.equalizers.map((equalizer) => {
      const [first, last] = [equalizer.weeks[0], equalizer.weeks[equalizer.weeks.length - 1]];
      const span = first === undefined ? "" : first === last ? `, Week ${first}` : `, Weeks ${first} to ${last}`;
      return {
        id: `lifeline-equalizer:${equalizer.weekNumber}`,
        weekNumber: equalizer.weekNumber,
        module: "danceCard" as const,
        label: `Lifeline Backfill${span}${weightSuffix(lifeline.weight)}`,
        points: equalizer.weightedPoints,
      };
    }),
  ].filter((line) => line.points !== 0);
  return withStoredLines(lines, added);
}

export type TradeTransferInput = { id: string; weekNumber: number; points: number; otherManagerId: string | null };

// Points a trade moved, on the week they landed on. Trades are roster
// business, so the lines sit with Dance Card and count in its total; they
// are never weighted.
export function withTradeLines(
  lines: ScoreHistoryLine[],
  transfers: TradeTransferInput[],
  managerNames: Map<string, string>
): ScoreHistoryLine[] {
  return withStoredLines(
    lines,
    transfers
      .filter((transfer) => transfer.points !== 0)
      .map((transfer) => ({
        id: `trade:${transfer.id}`,
        weekNumber: transfer.weekNumber,
        module: "danceCard" as const,
        label: `Trade: points ${transfer.points > 0 ? "from" : "to"} ${managerNames.get(transfer.otherManagerId ?? "") ?? "Unknown"}`,
        points: transfer.points,
      }))
  );
}

function withStoredLines(lines: ScoreHistoryLine[], added: ScoreHistoryLine[]): ScoreHistoryLine[] {
  if (added.length === 0) return lines;
  const moduleOrder = (line: ScoreHistoryLine) => (line.module === "curtainCall" ? 0 : line.module === "danceCard" ? 1 : 2);
  return [...lines, ...added].sort((a, b) => a.weekNumber - b.weekNumber || moduleOrder(a) - moduleOrder(b));
}

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
