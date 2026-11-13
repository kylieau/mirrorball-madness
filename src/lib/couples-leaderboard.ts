import { roundPoints } from "./format-points";
import type { RosterSlotPeriod } from "./roster-couple-points";
import type { HistoryWeekData } from "./score-history";
import { danceCardLedger, heldCreditCents, type DanceCardRule } from "./dance-card-v2";
import {
  DANCE_CARD_PLACEMENT_KEY,
  finalPlacementFromRange,
  NO_SURVIVAL_OUTCOMES,
  RESOLVING_OUTCOMES,
  eliminationPositionRanges,
  nightScaledScoresByCouple,
  type ScoringSettings,
} from "./scoring";

export type CoupleStanding = {
  coupleId: string;
  ownerId: string | null;
  // The holder's periods of the couple, in order; empty for a what-if row.
  holdings: { from: number; to: number | null }[];
  // Another manager has a row for this couple too.
  heldByOthers: boolean;
  judgesPoints: number;
  bonusPoints: number;
  totalPoints: number;
};

// What each couple has earned for each manager who held it, split into
// judges' points and everything else (survival, podium, per-couple bonus):
// one row per holder, over every period that manager held the couple, so a
// couple that changed hands keeps every holder's points (Kylie, 2026-11-12).
// Weeks before the Anchor Week pay nothing. A couple nobody has held is
// scored as if it had been on a roster since the Anchor Week, a what-if.
// Mirrors the Dance Card half of `computeWeeklyScores`, category weight
// included, so a manager's rows add up to the roster-earned part of their
// Dance Card total (Lifeline and trade points are manager-level and stay
// out). Under Dance Card v2/v3 a row is the couple's credits over the held
// weeks, and nothing sits outside them. Pass slots already clamped to what
// the viewer may see (`clampSlotsToWeek`).
export function buildCouplesLeaderboard({
  scoring,
  anchorWeek,
  categoryWeight,
  weeks,
  couples,
  slots,
  rule = { version: "v1" },
}: {
  rule?: DanceCardRule;
  scoring: ScoringSettings;
  anchorWeek: number;
  categoryWeight: number;
  weeks: Pick<HistoryWeekData, "weekNumber" | "danceScores" | "outcomes">[];
  couples: { id: string; status: string; elimination_week: number | null }[];
  slots: RosterSlotPeriod[];
}): CoupleStanding[] {
  const positionRanges = eliminationPositionRanges(couples);
  const totalCouples = couples.length;

  // couple → holder → their periods, in order.
  const holders = new Map<string, Map<string, RosterSlotPeriod[]>>();
  for (const slot of [...slots].sort((a, b) => a.startWeek - b.startWeek)) {
    const byHolder = holders.get(slot.coupleId) ?? new Map<string, RosterSlotPeriod[]>();
    byHolder.set(slot.managerId, [...(byHolder.get(slot.managerId) ?? []), slot]);
    holders.set(slot.coupleId, byHolder);
  }
  // Every row to build: each holder of each couple, or one what-if row.
  const rows = couples.flatMap((couple) => {
    const byHolder = holders.get(couple.id);
    if (!byHolder || byHolder.size === 0) return [{ couple, ownerId: null as string | null, periods: [] as RosterSlotPeriod[], heldByOthers: false }];
    return [...byHolder].map(([ownerId, periods]) => ({ couple, ownerId, periods, heldByOthers: byHolder.size > 1 }));
  });
  const standing = (row: (typeof rows)[number], judgesPoints: number, bonusPoints: number): CoupleStanding => ({
    coupleId: row.couple.id,
    ownerId: row.ownerId,
    holdings: row.periods.map((p) => ({ from: p.startWeek, to: p.endWeek })),
    heldByOthers: row.heldByOthers,
    judgesPoints,
    bonusPoints,
    totalPoints: roundPoints(judgesPoints + bonusPoints),
  });
  const covers = (row: (typeof rows)[number], week: number) =>
    row.periods.length === 0 || row.periods.some((p) => p.startWeek <= week && (p.endWeek === null || p.endWeek >= week));

  if (rule.version !== "v1") {
    const ledger = danceCardLedger(weeks, anchorWeek, rule);
    const lastWeek = Math.max(0, ...weeks.map((week) => week.weekNumber));
    return rows.map((row) => {
      const spans = row.periods.length === 0 ? [{ from: anchorWeek, to: lastWeek }] : row.periods.map((p) => ({ from: Math.max(anchorWeek, p.startWeek), to: p.endWeek ?? lastWeek }));
      const cents = (kind?: "judges") => spans.reduce((sum, span) => sum + heldCreditCents(ledger, row.couple.id, span.from, span.to, kind), 0);
      const totalPoints = roundPoints((cents() / 100) * categoryWeight);
      const judgesPoints = roundPoints((cents("judges") / 100) * categoryWeight);
      return standing(row, judgesPoints, roundPoints(totalPoints - judgesPoints));
    });
  }

  const judgesRaw = new Map<number, number>();
  const bonusRaw = new Map<number, number>();
  const add = (map: Map<number, number>, key: number, points: number) => map.set(key, (map.get(key) ?? 0) + points);

  for (const week of weeks) {
    if (week.weekNumber < anchorWeek) continue;
    const totals = nightScaledScoresByCouple(week.danceScores);
    const lastOutcome = new Map(week.outcomes.map((o) => [o.coupleId, o]));

    rows.forEach((row, key) => {
      if (!covers(row, week.weekNumber)) return;
      const couple = row.couple;
      add(judgesRaw, key, (totals.get(couple.id) ?? 0) * scoring.judgesScoreMultiplier);

      const outcome = lastOutcome.get(couple.id);
      if (!outcome) return;
      if (!NO_SURVIVAL_OUTCOMES.has(outcome.outcome)) add(bonusRaw, key, scoring.survivalPoints);
      const range = RESOLVING_OUTCOMES.has(outcome.outcome) ? positionRanges.get(couple.id) : undefined;
      const placement = range ? finalPlacementFromRange(range, totalCouples) : null;
      if (placement !== null && placement in DANCE_CARD_PLACEMENT_KEY) {
        add(bonusRaw, key, scoring[DANCE_CARD_PLACEMENT_KEY[placement]]);
      }
      add(bonusRaw, key, outcome.bonusPoints);
    });
  }

  return rows.map((row, key) =>
    standing(row, roundPoints((judgesRaw.get(key) ?? 0) * categoryWeight), roundPoints((bonusRaw.get(key) ?? 0) * categoryWeight))
  );
}
