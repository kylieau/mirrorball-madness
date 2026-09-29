import { postingWeekNumber } from "./draft-scores";
import { eastBroadcastEnded, liveAirPhase, type BannerWeek, type LiveAirPhase } from "./episode-banner";
import type { DraftScoreContext } from "./draft-scores-data";
import type { SpoilerFreeStripState } from "../components/spoiler-free-strip";

// Shared by every surface that mounts SpoilerFreeStrip (Home, Results, the
// league Picks/Standings pages) so the mark-watched state machine can't drift
// between them — one behavior, several mounting points. Callers supply the
// primitives they already load for their own page (resolveSpoilerCutoff,
// loadRevealingWeek, loadDraftScoreContext, the season's grouped weeks); this
// just resolves those into the one state the strip renders.
//
// A live-posting week is gated for everyone until they opt in, so the draft
// gap and posting strips show whatever the Spoiler-Free setting — they are
// the way back in after dismissing the live-air prompt. Ready and watching
// stay Spoiler-Free only.
export function buildSpoilerFreeStripState({
  spoilerFreeMode,
  lastWatchedWeek,
  draftUnlockedWeek,
  completedWeekNumbers,
  revealingWeekNumber,
  pendingRevealWeekNumber,
  draftReleaseWeekNumber,
  draftNightActive,
  draftWeekEastEnded,
  latestReleasedCouple,
  eastLiveWeekNumber,
}: {
  spoilerFreeMode: boolean;
  lastWatchedWeek: number;
  // draftContext.unlockedWeek
  draftUnlockedWeek: number;
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
  // eastBroadcastEnded for the draft release's week
  draftWeekEastEnded: boolean;
  // draftContext.latestReleasedCouple
  latestReleasedCouple: string | null;
  // The week whose East broadcast is on air right now, else null.
  eastLiveWeekNumber: number | null;
}): SpoilerFreeStripState | null {
  // After the East broadcast, drafts may be ahead of a viewer who hasn't
  // chosen Stay Updated or Mark Watched; Follow along unlocks them.
  if (
    draftReleaseWeekNumber != null &&
    draftWeekEastEnded &&
    lastWatchedWeek < draftReleaseWeekNumber &&
    draftUnlockedWeek < draftReleaseWeekNumber
  ) {
    return { kind: "draft_gap", weekNumber: draftReleaseWeekNumber, latestCouple: latestReleasedCouple };
  }

  const unmarkedWeeks = spoilerFreeMode
    ? completedWeekNumbers.filter((week) => week > lastWatchedWeek).sort((a, b) => a - b)
    : [];

  const postingWeek = postingWeekNumber({ lastWatchedWeek, revealingWeekNumber, draftReleaseWeekNumber });
  const stripWeek = postingWeek
    ? { kind: "posting" as const, weekNumber: postingWeek }
    : spoilerFreeMode && pendingRevealWeekNumber
      ? { kind: "ready" as const, weekNumber: pendingRevealWeekNumber }
      : null;
  if (stripWeek) {
    return {
      ...stripWeek,
      spoilerFree: spoilerFreeMode,
      eastLive: stripWeek.kind === "posting" && eastLiveWeekNumber === stripWeek.weekNumber,
      earlierWeeks: unmarkedWeeks.filter((week) => week < stripWeek.weekNumber),
    };
  }

  if (!spoilerFreeMode) return null;

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

export type LivePromptState = { coast: "east" | "west"; weekNumber: number };

// The "Scores Are Going Live" prompt: only inside the East or West window,
// only once that week has something posted (a released draft or a live
// couple), and only for viewers who haven't already opted in for that coast.
// East Stay Updated unlocks drafts, so it also covers the West window.
export function buildLivePromptState({
  phase,
  lastWatchedWeek,
  draftUnlockedWeek,
  revealingWeekNumber,
  draftReleaseWeekNumber,
}: {
  phase: LiveAirPhase | null;
  lastWatchedWeek: number;
  draftUnlockedWeek: number;
  revealingWeekNumber: number | null;
  draftReleaseWeekNumber: number | null;
}): LivePromptState | null {
  if (!phase || phase.kind === "gap") return null;
  const week = phase.weekNumber;
  if (revealingWeekNumber !== week && draftReleaseWeekNumber !== week) return null;
  if (phase.kind === "east" ? draftUnlockedWeek >= week : lastWatchedWeek >= week) return null;
  return { coast: phase.kind, weekNumber: week };
}

// One entry point for every page's loader: the sticky strip and the live-air
// prompt from the same primitives, evaluated at request time.
export function buildLiveAirChrome({
  spoilerFreeMode,
  lastWatchedWeek,
  completedWeekNumbers,
  revealingWeekNumber,
  pendingRevealWeekNumber,
  draftContext,
  bannerWeeks,
  now = new Date(),
}: {
  spoilerFreeMode: boolean;
  lastWatchedWeek: number;
  completedWeekNumbers: number[];
  revealingWeekNumber: number | null;
  pendingRevealWeekNumber: number | null;
  draftContext: DraftScoreContext;
  bannerWeeks: BannerWeek[];
  now?: Date;
}): { strip: SpoilerFreeStripState | null; prompt: LivePromptState | null; liveWindow: boolean } {
  const phase = liveAirPhase(bannerWeeks, now);
  const draftReleaseWeekNumber = draftContext.release?.weekNumber ?? null;
  return {
    strip: buildSpoilerFreeStripState({
      spoilerFreeMode,
      lastWatchedWeek,
      draftUnlockedWeek: draftContext.unlockedWeek,
      completedWeekNumbers,
      revealingWeekNumber,
      pendingRevealWeekNumber,
      draftReleaseWeekNumber,
      draftNightActive: !!draftContext.night,
      draftWeekEastEnded:
        draftReleaseWeekNumber != null && eastBroadcastEnded(bannerWeeks, draftReleaseWeekNumber, now),
      latestReleasedCouple: draftContext.latestReleasedCouple,
      eastLiveWeekNumber: phase?.kind === "east" ? phase.weekNumber : null,
    }),
    prompt: buildLivePromptState({
      phase,
      lastWatchedWeek,
      draftUnlockedWeek: draftContext.unlockedWeek,
      revealingWeekNumber,
      draftReleaseWeekNumber,
    }),
    // Pages auto-refresh through the live windows so the prompt appears when
    // the first draft or couple posts, without a reload.
    liveWindow: !!phase,
  };
}
