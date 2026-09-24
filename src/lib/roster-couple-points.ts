import { roundPoints } from "./format-points";

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
// and Dance Card was scoring count (mirrors which weeks applyEpisodeResults
// credits a roster slot). Deliberately judges' points only — survival and
// placement bonuses are manager-level and stay out of per-couple lines.
// Pass only slots active in `week`, so each couple appears once.
export function judgePointsThroughWeek({
  slots,
  scores,
  judgesScoreStartsWeek,
  week,
  multiplier,
  categoryWeight,
}: {
  slots: RosterSlotPeriod[];
  scores: { coupleId: string; weekNumber: number; totalScore: number }[];
  judgesScoreStartsWeek: number;
  week: number;
  multiplier: number;
  categoryWeight: number;
}): Map<string, { week: number; total: number }> {
  const scale = multiplier * categoryWeight;
  const points = new Map<string, { week: number; total: number }>();

  for (const slot of slots) {
    const firstWeek = Math.max(slot.startWeek, judgesScoreStartsWeek);
    const lastWeek = Math.min(slot.endWeek ?? week, week);
    let weekRaw = 0;
    let totalRaw = 0;
    for (const row of scores) {
      if (row.coupleId !== slot.coupleId) continue;
      if (row.weekNumber < firstWeek || row.weekNumber > lastWeek) continue;
      totalRaw += row.totalScore;
      if (row.weekNumber === week) weekRaw += row.totalScore;
    }
    points.set(slot.coupleId, { week: roundPoints(weekRaw * scale), total: roundPoints(totalRaw * scale) });
  }

  return points;
}
