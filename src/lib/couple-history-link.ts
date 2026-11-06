// leagueId: the league a Picks, Standings or Recast link came from, so the tab bar
// stays in it.
export type CoupleHistoryReturn = { href: string; label: string; leagueId: string | null };

// The couple page links back to wherever it was opened (Results, Home,
// Manage Leagues, a league's Picks, Standings or Recast); a standalone
// home-screen app has no browser back button.
export function coupleHistoryHref(coupleId: string, from: string): string {
  return `/couples/${coupleId}?from=${encodeURIComponent(from)}`;
}

const LEAGUE_PAGE_LABELS: Record<string, string> = { standings: "Standings", picks: "Picks", waivers: "Recast" };

// Only an in-app path is followed back (never another origin); anything else
// returns to Results.
export function coupleHistoryReturn(from: string | string[] | undefined): CoupleHistoryReturn {
  const path =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/\\") ? from : "/this-week";
  const pathname = path.split(/[?#]/)[0];
  const league = /^\/leagues\/([^/]+)\/(standings|picks|waivers)$/.exec(pathname);
  if (league) return { href: path, label: LEAGUE_PAGE_LABELS[league[2]], leagueId: league[1] };
  if (pathname === "/") return { href: path, label: "Home", leagueId: null };
  if (pathname === "/leagues") return { href: path, label: "Manage Leagues", leagueId: null };
  return { href: pathname === "/this-week" ? path : "/this-week", label: "Results", leagueId: null };
}
