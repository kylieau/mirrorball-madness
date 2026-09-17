import { formatEpisodeLabel } from "./format-week";

export type SeasonClockEpisode = {
  week_number: number;
  airs_at: string;
};

export function previewLockWeek({
  anchorWeek,
  effectiveHardDeadlineWeek,
  danceCardEnabled,
  draftStatus,
}: {
  anchorWeek: number;
  effectiveHardDeadlineWeek: number | null;
  danceCardEnabled: boolean;
  draftStatus: string;
}): number {
  // Mirrors effective_hard_deadline_week: auto-advance only protects an
  // in-progress Dance Card draft. Dance Card off (or a finished draft) is
  // just the commissioner's anchor week.
  if (draftStatus === "completed" || !danceCardEnabled) return anchorWeek;
  if (effectiveHardDeadlineWeek == null) return anchorWeek;
  return Math.max(anchorWeek, effectiveHardDeadlineWeek);
}

export function airsAtForWeek(
  episodes: SeasonClockEpisode[],
  weekNumber: number
): string | null {
  return episodes.find((e) => e.week_number === weekNumber)?.airs_at ?? null;
}

export function shouldShowAnchorSyncControl(
  canEdit: boolean,
  anchorWeek: number,
  lockWeek: number
): boolean {
  return canEdit && lockWeek !== anchorWeek;
}

export function formatLockWithEpisode(
  weekNumber: number,
  seasonNumber: number | null,
  formattedDeadline: string,
  hasAirsAt: boolean
): string {
  const label = formatEpisodeLabel(weekNumber, seasonNumber);
  if (!hasAirsAt) return `${label} (not yet scheduled)`;
  if (!formattedDeadline) return label;
  return `${label} · ${formattedDeadline}`;
}

export function explainSeasonClock({
  anchorWeek,
  lockWeek,
  seasonNumber,
  danceCardEnabled,
  draftStatus,
}: {
  anchorWeek: number;
  lockWeek: number;
  seasonNumber: number | null;
  danceCardEnabled: boolean;
  draftStatus: string;
}): string {
  const anchor = formatEpisodeLabel(anchorWeek, seasonNumber);
  const lock = formatEpisodeLabel(lockWeek, seasonNumber);

  if (lockWeek !== anchorWeek) {
    return `The draft is still open, so the lock has moved from ${anchor} to ${lock} — the next unaired episode. It freezes there once the draft wraps. Judges' Score still starts counting from ${anchor} until then.`;
  }

  if (!danceCardEnabled) {
    return `Grand Finale locks the moment ${anchor} airs.`;
  }

  const draftNote =
    draftStatus === "completed"
      ? ""
      : " The draft is expected to finish by then but isn't hard-blocked — if it's still open when this episode airs, the deadline pushes to the next one automatically until the draft wraps.";
  return `Judges' Score starts counting from ${anchor}, and Grand Finale locks the moment this episode airs.${draftNote}`;
}

export function explainGrandFinaleDeadline({
  anchorWeek,
  lockWeek,
  seasonNumber,
}: {
  anchorWeek: number;
  lockWeek: number;
  seasonNumber: number | null;
}): string {
  const lock = formatEpisodeLabel(lockWeek, seasonNumber);
  if (lockWeek !== anchorWeek) {
    return `Locks at ${lock} (the draft is still open, so this has pushed past the Season Clock anchor) — nothing to set here.`;
  }
  return `Locks automatically when ${lock} airs — nothing to set here.`;
}
