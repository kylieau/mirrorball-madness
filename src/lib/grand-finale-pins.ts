type PinnableCouple = {
  id: string;
  celebrity_name: string;
  status: string;
  elimination_week: number | null;
};

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
