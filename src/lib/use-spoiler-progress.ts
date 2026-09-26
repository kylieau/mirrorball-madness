"use client";

import { useCallback, useEffect, useState } from "react";
import { getSpoilerProgress } from "@/app/this-week/actions";
import type { SpoilerProgress } from "@/lib/spoiler-progress";

// Fetched once the page has painted (and again whenever the caller asks) so
// the picker is ready by the time the settings sheet opens, without adding
// queries to the page load itself.
export function useSpoilerProgress(enabled: boolean) {
  const [progress, setProgress] = useState<SpoilerProgress | null>(null);
  const load = useCallback(() => {
    void getSpoilerProgress().then(setProgress);
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { progress, load };
}
