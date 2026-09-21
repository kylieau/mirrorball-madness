import type { CoupleNameParts } from "./couple-display";

type RosterCouple = CoupleNameParts & {
  coupleId: string;
  eliminated?: boolean;
  points?: { week?: number; total: number };
};

export type LeagueRosterGroup = {
  managerId: string;
  displayName: string;
  isViewer: boolean;
  couples: RosterCouple[];
};

const OUT_STATUSES = new Set(["eliminated", "withdrawn"]);

// Your roster first, then everyone else alphabetically — until anyone has
// scored, when standings order (best first) means something.
export function orderManagersForRosters<T extends { managerId: string; displayName: string; totalPoints: number }>(
  managers: readonly T[],
  viewerId: string
): T[] {
  if (managers.some((m) => m.totalPoints !== 0)) {
    return [...managers].sort((a, b) => b.totalPoints - a.totalPoints);
  }
  return [...managers].sort((a, b) => {
    if (a.managerId === viewerId) return -1;
    if (b.managerId === viewerId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

// `asOfWeek` present => tag couples already out by that week. Callers only
// pass a week the viewer is allowed to see, so no spoiler clamp is needed
// here. Absent => no status at all (the draft-complete page shows where
// couples landed, not how they're doing).
export function buildLeagueRosters({
  managers,
  slots,
  couples,
  viewerId,
  asOfWeek,
  pointsByCoupleId,
}: {
  managers: { managerId: string; displayName: string }[];
  slots: { managerId: string; coupleId: string }[];
  couples: { id: string; status: string; eliminationWeek: number | null; names: CoupleNameParts }[];
  viewerId: string;
  asOfWeek?: number;
  pointsByCoupleId?: ReadonlyMap<string, { week?: number; total: number }>;
}): { groups: LeagueRosterGroup[]; unrostered: RosterCouple[] } {
  const couplesById = new Map(couples.map((c) => [c.id, c]));

  const toRosterCouple = (coupleId: string): RosterCouple | null => {
    const c = couplesById.get(coupleId);
    if (!c) return null;
    const points = pointsByCoupleId?.get(coupleId);
    return {
      coupleId,
      celebrity: c.names.celebrity,
      pro: c.names.pro,
      ...(points && { points }),
      ...(asOfWeek !== undefined && {
        eliminated: OUT_STATUSES.has(c.status) && c.eliminationWeek !== null && c.eliminationWeek <= asOfWeek,
      }),
    };
  };

  const rostered = new Set(slots.map((s) => s.coupleId));

  const groups = managers.map((m) => ({
    managerId: m.managerId,
    displayName: m.displayName,
    isViewer: m.managerId === viewerId,
    couples: slots
      .filter((s) => s.managerId === m.managerId)
      .map((s) => toRosterCouple(s.coupleId))
      .filter((c): c is RosterCouple => c !== null),
  }));

  const unrostered = couples
    .filter((c) => !rostered.has(c.id))
    .map((c) => toRosterCouple(c.id))
    .filter((c): c is RosterCouple => c !== null);

  return { groups, unrostered };
}
