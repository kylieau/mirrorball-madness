import { wasInCastForWeek } from "./episode-cast";
import { isOpenRosterStatus } from "./recast-framing";
import { spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";

export type RosterWeeklyTag = "eliminated" | "safe";

// Mirrors how a couple's raw judges' score becomes "points" everywhere else
// in the app: judges_score_multiplier is applied before a score is ever
// stored (see computeWeeklyScores in scoring.ts), and judges_score_category_
// weight is applied at display time rather than baked into storage, so a
// commissioner can reweight categories without rescoring history. This
// couple's weekly figure isn't read from a stored total, so both factors
// are applied here in one step.
export function computeCoupleWeeklyPoints(
  totalScore: number,
  judgesScoreMultiplier: number,
  categoryWeight: number
): number {
  return Math.round(totalScore * judgesScoreMultiplier * categoryWeight);
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
  couple: { status: string; eliminationWeek: number | null },
  opts: {
    cutoffWeek: number | null;
    finaleWeekNumber: number | null;
    weekNumber: number | null;
    rawWeeklyPoints: number;
  }
): { tag: RosterWeeklyTag; weeklyPoints: number } {
  const displayStatus = spoilerSafeCoupleStatus(couple, opts.cutoffWeek, opts.finaleWeekNumber);
  const tag = deriveCoupleWeeklyTag(displayStatus);

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
