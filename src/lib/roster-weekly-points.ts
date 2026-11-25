import { roundPoints } from "./format-points";
import { wasInCastForWeek } from "./episode-cast";
import { isOpenRosterStatus } from "./recast-framing";
import { isPlacedFinalist, spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";

// fourth_place / fifth_place: a Finale finalist placed by Finish Week, never gone home.
export type RosterWeeklyTag = "eliminated" | "safe" | "traded" | "dropped" | "fourth_place" | "fifth_place";

export type Holding = { from: number; to: number | null };

// "from Week 10", "Weeks 8–9", "Week 9", or "Weeks 2–3, from 6" for a couple
// held more than once.
export function holdingWeeksLabel(holdings: Holding[]): string {
  const parts = holdings.map((h, i) => {
    const word = i === 0 ? "Week" : "";
    if (h.to === null) return `${i === 0 ? "from Week" : "from"} ${h.from}`;
    if (h.to === h.from) return `${word} ${h.from}`.trim();
    return `${i === 0 ? "Weeks" : ""} ${h.from}–${h.to}`.trim();
  });
  return parts.join(", ");
}

// Why a couple left a manager's roster, for the dimmed card Picks keeps for
// it: traded when the period that followed theirs began by trade, eliminated
// when the couple has gone home as far as the viewer has watched, else
// dropped. The holder named is the one in the paged week, which the viewer
// has watched; a later holder is not.
export function formerCoupleNote({
  periods,
  next,
  holderNow,
  status,
  finalPlace,
}: {
  periods: Holding[];
  // How the period right after the manager's last one began, if any.
  next: { source?: string } | null;
  holderNow: { name: string } | null;
  status: string;
  // 4 or 5 for a Finale finalist, who never went home.
  finalPlace?: number | null;
}): { tag: RosterWeeklyTag; weeks: string; note: string | null } {
  const weeks = holdingWeeksLabel(periods);
  const now = holderNow ? `now with ${holderNow.name}` : null;
  if (next?.source === "trade") return { tag: "traded", weeks, note: now };
  if (isPlacedFinalist(status, finalPlace)) return { tag: finalPlace === 5 ? "fifth_place" : "fourth_place", weeks, note: now };
  if (status === "eliminated" || status === "withdrawn") return { tag: "eliminated", weeks, note: null };
  return { tag: "dropped", weeks, note: now };
}

// Survival, finale placement and per-couple bonus points aren't part of any
// couple's judges' line, so they're what's left of the week's weighted roster
// total after the couples' judges' points are taken out. Reading it as a
// remainder keeps the card's lines summing to the week's total exactly.
export function weeklyBonusPoints(
  weekRosterPoints: number,
  categoryWeight: number,
  coupleWeeklyPoints: number[]
): number {
  const judgesPoints = coupleWeeklyPoints.reduce((sum, p) => sum + p, 0);
  return Math.max(0, roundPoints(weekRosterPoints * categoryWeight - judgesPoints));
}

// Deliberately excludes survival/podium bonuses, which are manager-level
// rewards for an outcome rather than part of a single couple's score line —
// the Safe/Eliminated tag already communicates that outcome.
export function deriveCoupleWeeklyTag(coupleStatus: string): RosterWeeklyTag {
  if (coupleStatus === "eliminated" || coupleStatus === "withdrawn") return "eliminated";
  return "safe";
}

// Fan roster "this wk" line: spoiler-clamp the tag first, then week-aware
// points once the elim is revealed — same rule as admin episode-cast so a
// couple gone before this week cannot keep scoring as if they danced.
export function clampRosterCoupleForWeek(
  couple: { status: string; eliminationWeek: number | null; finalPlace?: number | null },
  opts: {
    cutoffWeek: number | null;
    finaleWeekNumber: number | null;
    weekNumber: number | null;
    rawWeeklyPoints: number;
  }
): { tag: RosterWeeklyTag; weeklyPoints: number } {
  const displayStatus = spoilerSafeCoupleStatus(couple, opts.cutoffWeek, opts.finaleWeekNumber);
  const tag = isPlacedFinalist(displayStatus, couple.finalPlace)
    ? couple.finalPlace === 5 ? "fifth_place" : "fourth_place"
    : deriveCoupleWeeklyTag(displayStatus);

  if (
    isOpenRosterStatus(displayStatus) &&
    opts.weekNumber != null &&
    !wasInCastForWeek(
      { status: couple.status, elimination_week: couple.eliminationWeek },
      opts.weekNumber
    )
  ) {
    return { tag, weeklyPoints: 0 };
  }

  return { tag, weeklyPoints: opts.rawWeeklyPoints };
}
