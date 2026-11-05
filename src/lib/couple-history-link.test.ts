import { describe, expect, it } from "vitest";
import { coupleHistoryHref, coupleHistoryReturn } from "./couple-history-link";

describe("coupleHistoryReturn", () => {
  it("goes back to the tab it was opened from, query included", () => {
    expect(coupleHistoryReturn("/this-week?week=w8")).toEqual({ href: "/this-week?week=w8", label: "Results", tab: "results" });
    expect(coupleHistoryReturn("/leagues/abc/standings")).toEqual({ href: "/leagues/abc/standings", label: "Standings", tab: "standings" });
    expect(coupleHistoryReturn("/leagues/abc/picks?week=3")).toMatchObject({ label: "Picks", tab: "picks" });
  });

  it("falls back to Results for anything that isn't a known in-app page", () => {
    for (const from of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "/admin/results", ["/this-week", "/"]]) {
      expect(coupleHistoryReturn(from)).toEqual({ href: "/this-week", label: "Results", tab: "results" });
    }
  });

  it("round-trips through the href", () => {
    const href = coupleHistoryHref("c1", "/this-week?week=w8");
    expect(href).toBe("/couples/c1?from=%2Fthis-week%3Fweek%3Dw8");
    expect(coupleHistoryReturn(new URL(href, "https://x.test").searchParams.get("from") ?? undefined).href).toBe("/this-week?week=w8");
  });
});
