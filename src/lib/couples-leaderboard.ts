import { roundPoints } from "./format-points";
import type { RosterSlotPeriod } from "./roster-couple-points";
import type { HistoryWeekData } from "./score-history";
import {
  DANCE_CARD_PLACEMENT_KEY,
  NO_SURVIVAL_OUTCOMES,
  RESOLVING_OUTCOMES,
  eliminationPositionRanges,
  sumDanceScoresByCouple,
  type ScoringSettings,
} from "./scoring";

export type CoupleStanding = {
  coupleId: string;
  ownerId: string | null;
  judgesPoints: number;
  bonusPoints: number;
  totalPoints: number;
};

// What each couple has earned for its manager, split into judges' points and
// everything else (survival, podium, per-couple bonus). Weeks before the
// Anchor Week pay nothing, and a rostered couple only earns for the weeks its
// current (or, once dropped, latest) holder held it. A couple nobody holds is
// scored as if it had been on a roster since the Anchor Week — a what-if.
// Mirrors the Dance Card half of `computeWeeklyScores`, category weight
// included, so a manager's couples add up to their Dance Card module total.
export function buildCouplesLeaderboard({
  scoring,
  anchorWeek,
  categoryWeight,
  weeks,
  couples,
  slots,
}: {
  scoring: ScoringSettings;
  anchorWeek: number;
  categoryWeight: number;
  weeks: Pick<HistoryWeekData, "weekNumber" | "danceScores" | "outcomes">[];
  couples: { id: string; status: string; elimination_week: number | null }[];
  slots: RosterSlotPeriod[];
}): CoupleStanding[] {
  const positionRanges = eliminationPositionRanges(couples);
  const totalCouples = couples.length;

  const holderByCouple = new Map<string, RosterSlotPeriod>();
  for (const slot of slots) {
    const held = holderByCouple.get(slot.coupleId);
    if (
      !held ||
      (held.endWeek !== null &&
        (slot.endWeek === null || slot.startWeek > held.startWeek))
    ) {
      holderByCouple.set(slot.coupleId, slot);
    }
  }

  const judgesRaw = new Map<string, number>();
  const bonusRaw = new Map<string, number>();
  const add = (map: Map<string, number>, coupleId: string, points: number) =>
    map.set(coupleId, (map.get(coupleId) ?? 0) + points);

  for (const week of weeks) {
    if (week.weekNumber < anchorWeek) continue;
    const totals = sumDanceScoresByCouple(week.danceScores);
    const lastOutcome = new Map(week.outcomes.map((o) => [o.coupleId, o]));

    for (const couple of couples) {
      const slot = holderByCouple.get(couple.id);
      if (
        slot &&
        (week.weekNumber < slot.startWeek ||
          (slot.endWeek !== null && week.weekNumber > slot.endWeek))
      ) {
        continue;
      }
      add(
        judgesRaw,
        couple.id,
        (totals.get(couple.id) ?? 0) * scoring.judgesScoreMultiplier
      );

      const outcome = lastOutcome.get(couple.id);
      if (!outcome) continue;
      if (!NO_SURVIVAL_OUTCOMES.has(outcome.outcome))
        add(bonusRaw, couple.id, scoring.survivalPoints);
      const range = RESOLVING_OUTCOMES.has(outcome.outcome)
        ? positionRanges.get(couple.id)
        : undefined;
      const placement = range ? totalCouples - range.start + 1 : null;
      if (placement !== null && placement in DANCE_CARD_PLACEMENT_KEY) {
        add(bonusRaw, couple.id, scoring[DANCE_CARD_PLACEMENT_KEY[placement]]);
      }
      add(bonusRaw, couple.id, outcome.bonusPoints);
    }
  }

  return couples.map((couple) => {
    const judgesPoints = roundPoints(
      (judgesRaw.get(couple.id) ?? 0) * categoryWeight
    );
    const bonusPoints = roundPoints(
      (bonusRaw.get(couple.id) ?? 0) * categoryWeight
    );
    return {
      coupleId: couple.id,
      ownerId: holderByCouple.get(couple.id)?.managerId ?? null,
      judgesPoints,
      bonusPoints,
      totalPoints: roundPoints(judgesPoints + bonusPoints),
    };
  });
}
