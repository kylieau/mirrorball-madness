import { postingWeekNumber } from "./draft-scores";
import type { SpoilerFreeStripState } from "../components/spoiler-free-strip";

// Shared by every surface that mounts SpoilerFreeStrip (Home, Results, the
// league hub) so the mark-watched state machine can't drift between them —
// one behavior, several mounting points. Callers supply the primitives they
// already load for their own page (resolveSpoilerCutoff, loadRevealingWeek,
// loadDraftScoreContext, the season's grouped weeks); this just resolves
// those into the one state the strip renders.
export function buildSpoilerFreeStripState({
  spoilerFreeMode,
  lastWatchedWeek,
  completedWeekNumbers,
  revealingWeekNumber,
  pendingRevealWeekNumber,
  draftReleaseWeekNumber,
  draftNightActive,
}: {
  spoilerFreeMode: boolean;
  lastWatchedWeek: number;
  // Every completed week's number for the season — the function derives
  // which of those are still unmarked.
  completedWeekNumbers: number[];
  // revealing?.week.week_number ?? null — intentionally regardless of
  // loadRevealingWeek's own `visible` flag: the strip's whole job is to
  // offer a behind viewer the choice on a week they can't see yet.
  revealingWeekNumber: number | null;
  // cutoff.pendingRevealEpisode?.week_number ?? null
  pendingRevealWeekNumber: number | null;
  // draftContext.release?.weekNumber ?? null
  draftReleaseWeekNumber: number | null;
  // !!draftContext.night
  draftNightActive: boolean;
}): SpoilerFreeStripState | null {
  if (!spoilerFreeMode) return null;

  const unmarkedWeeks = completedWeekNumbers.filter((week) => week > lastWatchedWeek).sort((a, b) => a - b);

  const postingWeek = postingWeekNumber({ lastWatchedWeek, revealingWeekNumber, draftReleaseWeekNumber });
  const stripWeek = postingWeek
    ? { kind: "posting" as const, weekNumber: postingWeek }
    : pendingRevealWeekNumber
      ? { kind: "ready" as const, weekNumber: pendingRevealWeekNumber }
      : null;
  if (stripWeek) {
    return { ...stripWeek, earlierWeeks: unmarkedWeeks.filter((week) => week < stripWeek.weekNumber) };
  }

  if (revealingWeekNumber != null) {
    return { kind: "watching", weekNumber: revealingWeekNumber };
  }

  // Caught up to a released-but-not-yet-live draft week, with no live draft
  // night object to show instead — still confirm "watching" rather than
  // showing nothing.
  const watchedDraft =
    draftReleaseWeekNumber != null && lastWatchedWeek >= draftReleaseWeekNumber && !draftNightActive;
  if (watchedDraft) {
    return { kind: "watching", weekNumber: draftReleaseWeekNumber };
  }

  return null;
}
