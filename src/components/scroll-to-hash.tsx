"use client";

import { useEffect } from "react";

// Next doesn't scroll to a #hash on a page that streams in behind its
// loading skeleton, so coming back from a couple's history to
// Standings#couples would land at the top.
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
