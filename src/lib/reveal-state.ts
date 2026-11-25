// Once any couple is posted, the outcomes step waits until every couple that
// has a drafted dance is posted too.
export function unpostedCoupleIds(
  draftDances: { coupleId: string }[],
  revealedCoupleIds: ReadonlySet<string>
): string[] {
  if (revealedCoupleIds.size === 0) return [];
  return [...new Set(draftDances.map((d) => d.coupleId))].filter((id) => !revealedCoupleIds.has(id));
}

export const UNDO_WINDOW_SECONDS = 30;

// Seconds left to undo a post, measured from when its scores went live.
export function undoSecondsLeft(postedAtIso: string, nowMs: number): number {
  const elapsed = Math.floor((nowMs - new Date(postedAtIso).getTime()) / 1000);
  return Math.max(0, UNDO_WINDOW_SECONDS - elapsed);
}
