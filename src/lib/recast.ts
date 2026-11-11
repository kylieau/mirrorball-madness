import { roundPoints } from "./format-points";

export type RecastClaim = { coupleId: string; slotNumber: number; dropCoupleId: string | null };

export type RecastMiss = "taken" | "slot_filled" | "slot_changed" | "drop_locked" | "not_dancing";

export const RECAST_MISS_COPY: Record<RecastMiss, string> = {
  taken: "Another manager has them.",
  slot_filled: "A claim higher on your list filled that spot.",
  slot_changed: "That roster spot changed before the run.",
  drop_locked: "You dropped them in the run before.",
  not_dancing: "They were no longer dancing.",
};

export function isRecastMiss(result: string | null): result is RecastMiss {
  return result != null && result in RECAST_MISS_COPY;
}

// Where a manager picked in the draft's first round: their first appearance
// in a custom order, else their draft position.
export function recastDraftRank(
  league: { draft_type: string; custom_pick_order: string[] | null },
  member: { user_id: string; draft_position: number | null }
): number | null {
  if (league.draft_type !== "custom") return member.draft_position;
  const index = league.custom_pick_order?.indexOf(member.user_id) ?? -1;
  return index < 0 ? null : index + 1;
}

export type RecastOrderEntry = { managerId: string; seasonTotal: number; lastWeekTotal: number };

// Reverse standings, the order a waiver run takes turns in: lowest season
// total first, then the lower most recent week, then whoever drafted later.
// Mirrors recast_order in SQL, which is the one the run uses; this one reads
// the weeks the viewer can see.
export function recastOrder(
  managers: { managerId: string; draftRank: number | null }[],
  weeklyTotals: { managerId: string; weekNumber: number; totalPoints: number }[]
): RecastOrderEntry[] {
  const lastWeek = Math.max(...weeklyTotals.map((row) => row.weekNumber));
  const total = (managerId: string, weekNumber?: number) =>
    roundPoints(
      weeklyTotals
        .filter((row) => row.managerId === managerId && (weekNumber == null || row.weekNumber === weekNumber))
        .reduce((sum, row) => sum + row.totalPoints, 0)
    );
  return managers
    .map((manager) => ({
      managerId: manager.managerId,
      draftRank: manager.draftRank,
      seasonTotal: total(manager.managerId),
      lastWeekTotal: total(manager.managerId, lastWeek),
    }))
    .sort(
      (x, y) =>
        x.seasonTotal - y.seasonTotal ||
        x.lastWeekTotal - y.lastWeekTotal ||
        (y.draftRank ?? -Infinity) - (x.draftRank ?? -Infinity) ||
        x.managerId.localeCompare(y.managerId)
    )
    .map(({ managerId, seasonTotal, lastWeekTotal }) => ({ managerId, seasonTotal, lastWeekTotal }));
}

export type RecastWireEntry = { coupleId: string; droppedBy: string | null };

// What a manager can claim: couples still dancing that nobody holds, plus
// couples another manager will drop if their own claim wins. A couple the
// manager dropped in the last run stays off their wire for this one.
export function recastWire({
  dancingCoupleIds,
  heldCoupleIds,
  pendingDrops,
  teamId,
  dropLockedCoupleIds,
}: {
  dancingCoupleIds: string[];
  heldCoupleIds: Set<string>;
  pendingDrops: { coupleId: string; managerId: string }[];
  teamId: string;
  dropLockedCoupleIds: Set<string>;
}): RecastWireEntry[] {
  const droppedBy = new Map(
    pendingDrops.filter((drop) => drop.managerId !== teamId).map((drop) => [drop.coupleId, drop.managerId])
  );
  return dancingCoupleIds
    .filter((coupleId) => !dropLockedCoupleIds.has(coupleId) && (!heldCoupleIds.has(coupleId) || droppedBy.has(coupleId)))
    .map((coupleId) => ({ coupleId, droppedBy: droppedBy.get(coupleId) ?? null }));
}

export function moveRecastClaim(list: RecastClaim[], index: number, by: -1 | 1): RecastClaim[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// League Settings and the Recast page explain the waiver run in the same words.
export const RECAST_RULES = [
  "Recast is Mirrorball's waiver wire. Rank the claims you want: each one fills an open roster spot or swaps out a couple you hold.",
  "Waiver lists are private. A waiver run decides every list 48 hours after a week's results are posted, with no commissioner step.",
  "Managers take turns in reverse standings order: lowest season total first, then the lower latest week, then the later draft pick. A turn awards that manager's highest claim that can still win, and the turns repeat until no claim can.",
  "A drop only happens if its claim wins. A couple a manager may drop shows on the wire, and anyone else can claim them in the same run.",
  "A new couple starts scoring in the next week that hasn't aired. The couple they replace keeps scoring for their manager until then.",
  "A couple you drop can't be claimed back by you in that run or the next one.",
  "Every awarded claim is posted to the league. Lists clear after each run, and there is no run after the Finale.",
];
