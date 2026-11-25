import { westFeedStillAiring } from "./episode-banner";

const PLACE_BY_OUTCOME: Partial<Record<string, number>> = { winner: 1, runner_up: 2, third_place: 3 };

// The Finale's finishers in order: the podium, then Finish Week's 4th and 5th
// (Eliminated with a place; a finalist left without one counts as 4th, as
// scoring does). Empty until a winner is named.
export function finalPlacements(rows: { couple_id: string; outcome: string; final_place?: number | null }[]): { coupleId: string; place: number }[] {
  if (!rows.some((r) => r.outcome === "winner")) return [];
  return rows
    .flatMap((r) => {
      const place = PLACE_BY_OUTCOME[r.outcome] ?? (r.outcome === "eliminated" ? (r.final_place ?? 4) : null);
      return place ? [{ coupleId: r.couple_id, place }] : [];
    })
    .sort((a, b) => a.place - b.place);
}

// Who went home each week before the Finale, newest week first; a week with
// nobody out keeps its line. Withdrawals count, as on the show.
export function seasonEliminationOrder(
  couples: { id: string; status: string; elimination_week: number | null }[],
  finaleWeekNumber: number
): { weekNumber: number; coupleIds: string[] }[] {
  return Array.from({ length: finaleWeekNumber - 1 }, (_, i) => finaleWeekNumber - 1 - i).map((weekNumber) => ({
    weekNumber,
    coupleIds: couples
      .filter((c) => c.elimination_week === weekNumber && (c.status === "eliminated" || c.status === "withdrawn"))
      .map((c) => c.id),
  }));
}

export type SeasonChampions = { winner: string; runnerUp: string | null; third: string | null };

// The podium's names for the season wrap, or null while the viewer hasn't
// watched the Finale: pass spoiler-clamped statuses, which read "active"
// until then.
export function seasonChampions(couples: { status: string; name: string }[]): SeasonChampions | null {
  const named = (status: string) => couples.find((c) => c.status === status)?.name ?? null;
  const winner = named("winner");
  return winner ? { winner, runnerUp: named("runner_up"), third: named("third_place") } : null;
}

// A finishing place from points: equal totals share a place (two tied at the
// top are both 1st, and the next is 3rd).
export function placeByPoints(points: number, all: number[]): number {
  return 1 + all.filter((p) => p > points).length;
}

// The week a manager scored most, from the stored weekly totals.
export function bestWeek(rows: { weekNumber: number; points: number }[]): { weekNumber: number; points: number } | null {
  return [...rows].sort((a, b) => b.points - a.points || a.weekNumber - b.weekNumber)[0] ?? null;
}

// Curtain Call weeks where a Home pick went home, out of the weeks with one.
export function eliminationPicksCalled(
  picks: { weekNumber: number; coupleIds: string[] }[],
  eliminatedByWeek: Map<number, Set<string>>
): { called: number; weeks: number } {
  const weeks = picks.filter((p) => p.coupleIds.length > 0 && eliminatedByWeek.has(p.weekNumber));
  return {
    called: weeks.filter((p) => p.coupleIds.some((id) => eliminatedByWeek.get(p.weekNumber)!.has(id))).length,
    weeks: weeks.length,
  };
}

// The real top five against where a bracket put them (1 = winner).
export function gradedBracket(
  finishers: { coupleId: string; place: number }[],
  predictedPlaceByCouple: Map<string, number>
): { coupleId: string; place: number; predictedPlace: number | null }[] {
  return finishers.map((f) => ({ ...f, predictedPlace: predictedPlaceByCouple.get(f.coupleId) ?? null }));
}

// The Finale's night until the West feed ends (10pm PT): the wrap waits, as
// the banner does, so nothing names a finisher before the West Coast has seen it.
export function finaleStillAiring(
  weeks: { is_finale?: boolean; episodes: { airs_at: string }[] }[],
  now: Date = new Date()
): boolean {
  return weeks.some((week) => week.is_finale && week.episodes.some((episode) => westFeedStillAiring(episode.airs_at, now)));
}
