export type ScoringJudge = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export function isJudgeArchived(judge: Pick<ScoringJudge, "archivedAt">): boolean {
  return judge.archivedAt != null;
}

// Empty score boxes come from the standing panel (archived_at is null). An
// archived judge still appears when they already have a score on this dance
// so published/draft history stays editable and visible.
export function judgesForScoreInputs<T extends ScoringJudge>(
  judges: T[],
  scoredJudgeIds: Iterable<string> = []
): T[] {
  const scored = new Set(scoredJudgeIds);
  return judges.filter((j) => j.archivedAt == null || scored.has(j.id));
}
