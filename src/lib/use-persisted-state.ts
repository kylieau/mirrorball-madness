"use client";

import { useEffect, useRef, useState } from "react";

// First use of localStorage in this repo — a per-viewer UI convenience
// (collapse/expand state), never data anyone else needs to see. SSR-safe:
// both the server render and the client's first paint use defaultValue, and
// an effect adopts whatever's stored after mount (same hydration-safety
// convention as useFormattedDeadline for viewer-timezone formatting).
export function usePersistedState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore malformed/unavailable storage
    }
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota/unavailable storage
    }
  }, [key, value]);

  return [value, setValue];
}
