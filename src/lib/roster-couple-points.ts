import { roundPoints } from "./format-points";
import { collapseToNights, type DanceScore } from "./scoring";
import { danceCardLedger, danceCardWeeksFromRows, heldCreditCents, judgesCents, ledgerEntry, type DanceCardRule } from "./dance-card-v2";

export type RosterSlotPeriod = {
  managerId: string;
  coupleId: string;
  startWeek: number;
  endWeek: number | null;
  // How the period began (draft, waiver, trade, …), when the reader has it.
  source?: string;
};

export function slotActiveInWeek(slot: RosterSlotPeriod, week: number): boolean {
  return slot.startWeek <= week && (slot.endWeek === null || slot.endWeek >= week);
}

// The periods as a viewer who has watched through `cutoff` may see them: a
// holding that starts at week N is public once week N-1 is watched (the rule
// the Trade Log and Recast's awards use), so one starting later is dropped,
// and one that ends after the cutoff still reads as open. With nothing
// scored (cutoff 0) every draft holding from Week 1 shows.
export function clampSlotsToWeek<T extends RosterSlotPeriod>(slots: T[], cutoff: number): T[] {
  return slots.flatMap((slot) => {
    if (slot.startWeek > cutoff + 1) return [];
    return [slot.endWeek !== null && slot.endWeek > cutoff ? { ...slot, endWeek: null } : slot];
  });
}

// A manager's couples that left their roster before `week`: each couple once,
// with every period of theirs that ended before the week and at or after the
// Anchor Week (an earlier one never scored), newest end first. A couple they
// hold again in `week` is a current couple, not a former one.
export function formerSlotsForWeek(
  slots: RosterSlotPeriod[],
  managerId: string,
  week: number,
  anchorWeek: number
): { coupleId: string; periods: RosterSlotPeriod[] }[] {
  const mine = slots.filter((slot) => slot.managerId === managerId);
  const heldNow = new Set(mine.filter((slot) => slotActiveInWeek(slot, week)).map((slot) => slot.coupleId));
  const byCouple = new Map<string, RosterSlotPeriod[]>();
  for (const slot of mine) {
    if (slot.endWeek === null || slot.endWeek >= week || slot.endWeek < anchorWeek || heldNow.has(slot.coupleId)) continue;
    byCouple.set(slot.coupleId, [...(byCouple.get(slot.coupleId) ?? []), slot]);
  }
  return [...byCouple]
    .map(([coupleId, periods]) => ({ coupleId, periods: periods.sort((a, b) => a.startWeek - b.startWeek) }))
    .sort((a, b) => Math.max(...b.periods.map((p) => p.endWeek!)) - Math.max(...a.periods.map((p) => p.endWeek!)));
}

// Judges' points a rostered couple earned for its manager: `week` is that one
// week, `total` is the running sum through it. Only weeks the slot was held
// and Dance Card was scoring count (mirrors which weeks buildWeeklyScoreRows
// credits a roster slot). Deliberately judges' points only — survival and
// placement bonuses are manager-level and stay out of per-couple lines.
// A couple held over more than one period (dropped and claimed back, or a
// former couple shown beside the current ones) adds its periods up, so each
// couple appears once; pass every period of the manager's that reaches
// `week` or ended before it. Dance rows are collapsed per night first
// (collapseToNights), the same way the engine pays them. Under Dance Card v2/v3 the lines are the judges' part of the
// couple's credits, which need every earlier visible week and its settled
// outcomes.
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
  bonuses?: { weekNumber: number; coupleId: string; bonusPoints: number; outcome?: string }[];
}): Map<string, { week: number; total: number }> {
  // Raw per couple, weighted and rounded once at the end, so a couple held
  // over two periods rounds the same way as one period would.
  const raw = new Map<string, { week: number; total: number }>();
  const credit = (coupleId: string, week: number, total: number) => {
    const held = raw.get(coupleId) ?? { week: 0, total: 0 };
    raw.set(coupleId, { week: held.week + week, total: held.total + total });
  };
  const rounded = (scale: number) =>
    new Map([...raw].map(([coupleId, p]) => [coupleId, { week: roundPoints(p.week * scale), total: roundPoints(p.total * scale) }]));
  if (rule.version !== "v1") {
    const ledger = danceCardLedger(
      danceCardWeeksFromRows(scores.filter((row) => row.weekNumber <= week), bonuses.filter((b) => b.weekNumber <= week)),
      judgesScoreStartsWeek,
      rule
    );
    for (const slot of slots) {
      const firstWeek = Math.max(slot.startWeek, judgesScoreStartsWeek);
      const lastWeek = Math.min(slot.endWeek ?? week, week);
      const entry = lastWeek === week && firstWeek <= week ? ledgerEntry(ledger, slot.coupleId, week) : null;
      const weekCents = entry ? judgesCents(entry) : 0;
      credit(slot.coupleId, weekCents, heldCreditCents(ledger, slot.coupleId, firstWeek, lastWeek, "judges"));
    }
    return rounded(categoryWeight / 100);
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
    credit(slot.coupleId, weekScaled, totalScaled);
  }

  return rounded(scale);
}
