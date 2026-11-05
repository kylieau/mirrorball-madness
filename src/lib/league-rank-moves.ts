export type RankMove = {
  weekNumber: number;
  managerId: string;
  // Managers this one was strictly behind before the week and strictly ahead
  // of after it, best-placed first.
  passedIds: string[];
  place: number;
};

// Week-by-week overtakes in one league, from each week's points per manager
// (already limited to the weeks the viewer may see). Recomputed on every load,
// so a week still being revealed shows its net movement so far. Ties on
// either side are not an overtake, so a first scoring week from 0–0 adds none.
export function weeklyRankMoves(
  managerIds: string[],
  weeks: { weekNumber: number; points: Map<string, number> }[]
): RankMove[] {
  const moves: RankMove[] = [];
  let before = new Map(managerIds.map((id) => [id, 0]));
  for (const week of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const after = new Map(managerIds.map((id) => [id, before.get(id)! + (week.points.get(id) ?? 0)]));
    for (const id of managerIds) {
      const passedIds = managerIds
        .filter((other) => before.get(id)! < before.get(other)! && after.get(id)! > after.get(other)!)
        .sort((a, b) => after.get(b)! - after.get(a)!);
      if (passedIds.length === 0) continue;
      const place = 1 + managerIds.filter((other) => after.get(other)! > after.get(id)!).length;
      moves.push({ weekNumber: week.weekNumber, managerId: id, passedIds, place });
    }
    before = after;
  }
  return moves;
}
