export type ScoringJudge = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export function isJudgeArchived(judge: Pick<ScoringJudge, "archivedAt">): boolean {
  return judge.archivedAt != null;
}

// Empty score boxes come from the standing panel (archived_at is null) plus
// this episode's guest judges (episode_guest_judges). An archived judge still
// appears when they already have a score on this dance so published/draft
// history stays editable and visible.
export function judgesForScoreInputs<T extends ScoringJudge>(
  judges: T[],
  scoredJudgeIds: Iterable<string> = [],
  episodeGuestJudgeIds: Iterable<string> = []
): T[] {
  const shown = new Set([...scoredJudgeIds, ...episodeGuestJudgeIds]);
  return judges.filter((j) => j.archivedAt == null || shown.has(j.id));
}
