import { formatManagerName } from "./manager-display";

export type LeagueGrandFinalePrediction = {
  managerId: string;
  displayName: string;
  order: string[]; // couple ids, elimination-ascending, same convention as GrandFinaleBox's existingOrder
};

// Pure grouping/sort — the raw league-wide grand_finale_predictions query
// (no manager_id filter, unlike the per-viewer query) lives in page.tsx;
// this just shapes it. Managers with no submitted rows are simply absent, and
// so is the viewer — their own bracket is the card above the list.
export function buildLeagueGrandFinalePredictions({
  predictions,
  members,
  viewerTeamId,
}: {
  predictions: { manager_id: string; couple_id: string; predicted_position: number }[];
  members: {
    user_id: string;
    profiles: { display_name: string } | null;
    co_manager: { display_name: string } | null;
  }[];
  viewerTeamId: string;
}): LeagueGrandFinalePrediction[] {
  const orderByManager = new Map<string, { position: number; coupleId: string }[]>();
  for (const p of predictions) {
    const list = orderByManager.get(p.manager_id) ?? [];
    list.push({ position: p.predicted_position, coupleId: p.couple_id });
    orderByManager.set(p.manager_id, list);
  }

  const nameByManager = new Map(
    members.map((m) => [
      m.user_id,
      formatManagerName({
        displayName: m.profiles?.display_name ?? "Unknown",
        coManagerDisplayName: m.co_manager?.display_name,
      }),
    ])
  );

  const result: LeagueGrandFinalePrediction[] = [];
  for (const [managerId, entries] of orderByManager) {
    if (managerId === viewerTeamId) continue;
    result.push({
      managerId,
      displayName: nameByManager.get(managerId) ?? "Unknown",
      order: [...entries].sort((a, b) => a.position - b.position).map((e) => e.coupleId),
    });
  }

  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
