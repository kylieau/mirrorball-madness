"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RefreshWindow } from "@/lib/episode-banner";

const REFRESH_MS = 20_000;

// Pages are server-rendered, so a viewer only sees newly posted scores when the
// route re-fetches. Runs while a reveal is already happening (active) or while
// the clock is inside an episode night's window (checked each tick, so a page
// opened before the curtain starts refreshing on its own), and only for a
// visible tab.
export function RevealAutoRefresh({ active, windows = [] }: { active: boolean; windows?: RefreshWindow[] }) {
  const router = useRouter();

  useEffect(() => {
    if (!active && windows.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const inWindow = windows.some((window) => now >= window.startMs && now < window.endMs);
      if ((active || inWindow) && document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, windows, router]);

  return null;
}
