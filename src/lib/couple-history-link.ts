export type CoupleHistoryReturn = { href: string; label: string; tab: "home" | "results" | "picks" | "standings" };

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
  if (/^\/leagues\/[^/]+\/standings$/.test(pathname)) return { href: path, label: "Standings", tab: "standings" };
  if (/^\/leagues\/[^/]+\/picks$/.test(pathname)) return { href: path, label: "Picks", tab: "picks" };
  if (pathname === "/") return { href: path, label: "Home", tab: "home" };
  return { href: pathname === "/this-week" ? path : "/this-week", label: "Results", tab: "results" };
}
