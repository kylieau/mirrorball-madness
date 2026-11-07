import { roundPoints } from "./format-points";
import { collapseToNights, type DanceScore } from "./scoring";
import { danceCardLedger, danceCardWeeksFromRows, heldCreditCents, ledgerEntry, type DanceCardRule } from "./dance-card-v2";

export type RosterSlotPeriod = {
  managerId: string;
  coupleId: string;
  startWeek: number;
  endWeek: number | null;
};

export function slotActiveInWeek(slot: RosterSlotPeriod, week: number): boolean {
  return slot.startWeek <= week && (slot.endWeek === null || slot.endWeek >= week);
}

// Judges' points a rostered couple earned for its manager: `week` is that one
// week, `total` is the running sum through it. Only weeks the slot was held
// and Dance Card was scoring count (mirrors which weeks buildWeeklyScoreRows
// credits a roster slot). Deliberately judges' points only — survival and
// placement bonuses are manager-level and stay out of per-couple lines.
// Pass only slots active in `week`, so each couple appears once. Dance rows
// are collapsed per night first (collapseToNights), the same way the engine
// pays them. Under Dance Card v2 the lines are the couple's credits, which
// need every earlier visible week and its settled bonuses.
export function judgePointsThroughWeek({
  slots,
  scores,
  judgesScoreStartsWeek,
  week,
  multiplier,
  categoryWeight,
  rule = { version: "v1" },
  bonuses = [],
}: {
  slots: RosterSlotPeriod[];
  scores: (DanceScore & { weekNumber: number })[];
  judgesScoreStartsWeek: number;
  week: number;
  multiplier: number;
  categoryWeight: number;
  rule?: DanceCardRule;
  bonuses?: { weekNumber: number; coupleId: string; bonusPoints: number }[];
}): Map<string, { week: number; total: number }> {
  const points = new Map<string, { week: number; total: number }>();
  if (rule.version === "v2") {
    const ledger = danceCardLedger(
      danceCardWeeksFromRows(scores.filter((row) => row.weekNumber <= week), bonuses.filter((b) => b.weekNumber <= week)),
      judgesScoreStartsWeek,
      rule
    );
    for (const slot of slots) {
      const firstWeek = Math.max(slot.startWeek, judgesScoreStartsWeek);
      const lastWeek = Math.min(slot.endWeek ?? week, week);
      const weekCents = lastWeek === week && firstWeek <= week ? (ledgerEntry(ledger, slot.coupleId, week)?.creditCents ?? 0) : 0;
      points.set(slot.coupleId, {
        week: roundPoints((weekCents / 100) * categoryWeight),
        total: roundPoints((heldCreditCents(ledger, slot.coupleId, firstWeek, lastWeek) / 100) * categoryWeight),
      });
    }
    return points;
  }
  const scale = multiplier * categoryWeight;
  const weekOfEpisode = new Map(scores.map((row) => [row.episodeId, row.weekNumber]));
  const nights = collapseToNights(scores).map((night) => ({
    ...night,
    weekNumber: weekOfEpisode.get(night.episodeId)!,
  }));

  for (const slot of slots) {
    const firstWeek = Math.max(slot.startWeek, judgesScoreStartsWeek);
    const lastWeek = Math.min(slot.endWeek ?? week, week);
    let weekScaled = 0;
    let totalScaled = 0;
    for (const night of nights) {
      if (night.coupleId !== slot.coupleId) continue;
      if (night.weekNumber < firstWeek || night.weekNumber > lastWeek) continue;
      totalScaled += night.scaledScore;
      if (night.weekNumber === week) weekScaled += night.scaledScore;
    }
    points.set(slot.coupleId, { week: roundPoints(weekScaled * scale), total: roundPoints(totalScaled * scale) });
  }

  return points;
}
