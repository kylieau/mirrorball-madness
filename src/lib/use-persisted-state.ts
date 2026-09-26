"use client";

import { useEffect, useState } from "react";

// First use of localStorage in this repo — a per-viewer UI convenience
// (collapse/expand state), never data anyone else needs to see. SSR-safe:
// both the server render and the client's first paint use defaultValue, and
// an effect adopts whatever's stored after mount (same hydration-safety
// convention as useFormattedDeadline for viewer-timezone formatting). The
// third element flips once the stored value has been adopted, for callers that
// must not act on the default (e.g. auto-opening a sheet).
export function usePersistedState<T>(key: string, defaultValue: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore malformed/unavailable storage
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota/unavailable storage
    }
  }, [key, value, hydrated]);

  return [value, setValue, hydrated];
}
