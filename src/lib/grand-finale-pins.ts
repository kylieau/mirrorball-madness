export type PinnableCouple = {
  id: string;
  celebrity_name: string;
  status: string;
  elimination_week: number | null;
};

// A couple's fate no longer being "next up to predict" includes not just
// eliminated/withdrawn but the terminal placement statuses too — otherwise a
// fully-decided season would still flag the winner as a pending elimination.
const RESOLVED_STATUSES = new Set(["eliminated", "withdrawn", "winner", "runner_up", "third_place"]);

// Callers pass spoiler-clamped statuses, so a couple only counts as gone once
// the viewer has been allowed to see it — never pin an unrevealed elimination.
export function pinnedEliminatedIds(couples: PinnableCouple[]): string[] {
  return couples
    .filter((c) => c.status === "eliminated" || c.status === "withdrawn")
    .sort(
      (a, b) =>
        (a.elimination_week ?? 0) - (b.elimination_week ?? 0) ||
        a.celebrity_name.localeCompare(b.celebrity_name)
    )
    .map((c) => c.id);
}

// order[] is elimination-ascending, so the couples already gone occupy the
// leading slots; everyone else keeps their relative order behind them.
export function pinEliminatedFirst(order: string[], pinnedIds: string[]): string[] {
  const pinned = new Set(pinnedIds);
  return [...pinnedIds, ...order.filter((id) => !pinned.has(id))];
}

// The couple this bracket has in the next elimination slot — the same slot
// for every manager, so everyone's "next elim" lines up with the same week.
// A saved order is never re-pinned after submission (pinEliminatedFirst only
// runs on Edit Order), so a slot's couple can already be gone; then it takes
// the next still-active couple after that slot, and only if none is left
// falls back to the first still-active couple anywhere. Null once nothing is
// left to predict.
export function nextPredictedElimination(order: string[], couples: PinnableCouple[]): string | null {
  const statusById = new Map(couples.map((c) => [c.id, c.status]));
  const isOpen = (id: string) => !RESOLVED_STATUSES.has(statusById.get(id) ?? "");
  const slot = pinnedEliminatedIds(couples).length;
  return order.slice(slot).find(isOpen) ?? order.find(isOpen) ?? null;
}
