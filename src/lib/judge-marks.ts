import { MARK_MAX } from "./scoring";

// DWTS judges mark in whole numbers and never give a 0. The same rule is the
// whole_judge_mark check on judge_scores, draft_judge_scores and
// episode_team_marks (supabase/apply-whole-judge-marks.sql), with this message.
export const MARK_MIN = 1;
export const JUDGE_MARK_MESSAGE = `Judge scores must be whole numbers from ${MARK_MIN} to ${MARK_MAX}.`;

export function isValidMark(score: number): boolean {
  return Number.isInteger(score) && score >= MARK_MIN && score <= MARK_MAX;
}

// Empty is "not yet entered"; anything else typed must be a valid mark.
export function markInputError(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return isValidMark(Number(trimmed)) ? null : JUDGE_MARK_MESSAGE;
}
