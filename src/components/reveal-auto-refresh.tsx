"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 20_000;

// Pages are server-rendered, so a viewer only sees newly posted scores when the
// route re-fetches. Runs only while a reveal can be happening, and only for a
// visible tab.
export function RevealAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
