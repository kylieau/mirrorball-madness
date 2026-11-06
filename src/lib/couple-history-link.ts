// leagueId: the league a Picks or Standings link came from, so the tab bar
// stays in it.
export type CoupleHistoryReturn = { href: string; label: string; leagueId: string | null };

// The couple page is opened from Results, Picks or Standings and links back
// there; a standalone home-screen app has no browser back button.
export function coupleHistoryHref(coupleId: string, from: string): string {
  return `/couples/${coupleId}?from=${encodeURIComponent(from)}`;
}

// Only an in-app path is followed back (never another origin); anything else
// returns to Results.
export function coupleHistoryReturn(from: string | string[] | undefined): CoupleHistoryReturn {
  const path =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/\\") ? from : "/this-week";
  const pathname = path.split(/[?#]/)[0];
  const league = /^\/leagues\/([^/]+)\/(standings|picks)$/.exec(pathname);
  if (league) return { href: path, label: league[2] === "picks" ? "Picks" : "Standings", leagueId: league[1] };
  if (pathname === "/") return { href: path, label: "Home", leagueId: null };
  return { href: pathname === "/this-week" ? path : "/this-week", label: "Results", leagueId: null };
}
