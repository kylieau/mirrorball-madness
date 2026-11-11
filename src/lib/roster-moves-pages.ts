import type { RosterMoveTabKey } from "./league-triage";

const TAB_PATHS: Record<RosterMoveTabKey, string> = { lifeline: "lifeline", recast: "waivers", trades: "trades" };

export function rosterMoveTabHref(leagueId: string, key: RosterMoveTabKey, from: string): string {
  return `/leagues/${leagueId}/${TAB_PATHS[key]}?from=${encodeURIComponent(from)}`;
}

// The pages' back link says where it goes: Picks (the usual way in), Home or
// Manage Leagues when a league card sent the viewer, else just Back.
export function rosterMovesBackLabel(href: string, leagueId: string): string {
  const pathname = href.split(/[?#]/)[0];
  if (pathname === `/leagues/${leagueId}/picks`) return "Picks";
  if (pathname === "/") return "Home";
  if (pathname === "/leagues") return "Manage Leagues";
  return "Back";
}
