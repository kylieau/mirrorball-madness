export type CoupleRevealState = "posted" | "ready" | "waiting";

type DraftDanceForReveal = { coupleId: string; judgeScores: { score: number }[] };

// Ready means the saved draft has at least one dance for the couple and every
// dance carries judge scores; Posted means its scores are already live.
export function couplesRevealState(
  draftDances: DraftDanceForReveal[],
  revealedCoupleIds: ReadonlySet<string>
): Map<string, CoupleRevealState> {
  const dancesByCouple = new Map<string, DraftDanceForReveal[]>();
  for (const dance of draftDances) {
    const list = dancesByCouple.get(dance.coupleId) ?? [];
    list.push(dance);
    dancesByCouple.set(dance.coupleId, list);
  }

  const states = new Map<string, CoupleRevealState>();
  for (const [coupleId, dances] of dancesByCouple) {
    if (revealedCoupleIds.has(coupleId)) states.set(coupleId, "posted");
    else states.set(coupleId, dances.every((d) => d.judgeScores.length > 0) ? "ready" : "waiting");
  }
  return states;
}

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
