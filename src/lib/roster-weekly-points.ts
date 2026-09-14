export type RosterWeeklyTag = "eliminated" | "bottom_two" | "safe";

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
// the Safe/Bottom two/Eliminated tag already communicates that outcome.
export function deriveCoupleWeeklyTag(coupleStatus: string, wasBottomTwo: boolean): RosterWeeklyTag {
  if (coupleStatus === "eliminated" || coupleStatus === "withdrawn") return "eliminated";
  if (wasBottomTwo) return "bottom_two";
  return "safe";
}
