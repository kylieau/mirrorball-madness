import { pinEliminatedFirst } from "./grand-finale-pins";

export type DestinationStatus = "ok" | "will_replace" | "module_off" | "locked";

export type Destination = {
  id: string;
  name: string;
  status: DestinationStatus;
  note: string | null;
};

export type CurtainCallPick = {
  elim1: string | null;
  elim2: string | null;
  topScorer: string | null;
};

export type CurtainCallDestination = Destination & { pick: CurtainCallPick | null };
export type GrandFinaleDestination = Destination & { order: string[] | null };
export type DraftQueueDestination = Destination & { queue: string[] | null };

export function isSelectable(status: DestinationStatus): boolean {
  return status === "ok" || status === "will_replace";
}

// Only leagues with nothing to lose start ticked — replacing an existing pick
// is always the viewer's explicit choice.
export function defaultSelection(destinations: Destination[]): string[] {
  return destinations.filter((d) => d.status === "ok").map((d) => d.id);
}

// The RPCs re-check all of this; the plan only decides what to offer.
// missingLockIsLocked: Grand Finale has no deadline until Week 1 exists and
// its RPC refuses a null one, whereas an unset Curtain Call lock means open.
export function planDestination(input: {
  moduleLabel: string;
  moduleOn: boolean;
  lockAt: string | null;
  missingLockIsLocked: boolean;
  hasPick: boolean;
  now: Date;
}): { status: DestinationStatus; note: string | null } {
  if (!input.moduleOn) return { status: "module_off", note: `${input.moduleLabel} is off in this league` };

  const locked = input.lockAt ? input.now >= new Date(input.lockAt) : input.missingLockIsLocked;
  if (locked) return { status: "locked", note: "Picks are locked" };

  return input.hasPick
    ? { status: "will_replace", note: "Replaces your current picks" }
    : { status: "ok", note: null };
}

// Couples are season-wide but the eligible pool is spoiler-clamped per
// viewer, so a source pick can name someone the viewer now sees as gone.
export function adaptCurtainCallPick(pick: CurtainCallPick, eligibleCoupleIds: Set<string>): CurtainCallPick {
  const keep = (id: string | null) => (id && eligibleCoupleIds.has(id) ? id : null);
  return { elim1: keep(pick.elim1), elim2: keep(pick.elim2), topScorer: keep(pick.topScorer) };
}

// Returns null when the source order doesn't cover the whole season cast, so
// the caller never pre-fills a ranking the RPC would reject.
export function adaptGrandFinaleOrder(
  order: string[],
  seasonCoupleIds: string[],
  pinnedIds: string[]
): string[] | null {
  const season = new Set(seasonCoupleIds);
  const kept = order.filter((id) => season.has(id));
  if (kept.length !== season.size) return null;
  return pinEliminatedFirst(kept, pinnedIds);
}

// The queue has no deadline of its own: it stays editable until the draft is
// over, and a league without Dance Card has no draft to queue for.
export function planQueueDestination(input: {
  danceCardOn: boolean;
  draftCompleted: boolean;
  hasQueue: boolean;
}): { status: DestinationStatus; note: string | null } {
  if (!input.danceCardOn) return { status: "module_off", note: "Dance Card is off in this league" };
  if (input.draftCompleted) return { status: "locked", note: "Draft is over" };
  return input.hasQueue
    ? { status: "will_replace", note: "Replaces your current queue" }
    : { status: "ok", note: null };
}

// The RPC rejects couples outside the current season; order is otherwise the
// viewer's own wishlist and carries over untouched.
export function adaptDraftQueue(queue: string[], seasonCoupleIds: string[]): string[] {
  const season = new Set(seasonCoupleIds);
  return queue.filter((id) => season.has(id));
}
