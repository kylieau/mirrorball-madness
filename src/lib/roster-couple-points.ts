import { roundPoints } from "./format-points";
import { collapseToNights, type DanceScore } from "./scoring";

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
// pays them.
export function judgePointsThroughWeek({
  slots,
  scores,
  judgesScoreStartsWeek,
  week,
  multiplier,
  categoryWeight,
}: {
  slots: RosterSlotPeriod[];
  scores: (DanceScore & { weekNumber: number })[];
  judgesScoreStartsWeek: number;
  week: number;
  multiplier: number;
  categoryWeight: number;
}): Map<string, { week: number; total: number }> {
  const scale = multiplier * categoryWeight;
  const points = new Map<string, { week: number; total: number }>();
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
