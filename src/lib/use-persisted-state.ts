"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APP } from "@/config/app";

// A keyed value never borrows another key's state or writes it into storage.
// SSR and the first browser render both use the supplied default.
export function usePersistedState<T>(name: string, defaultValue: T): [T, (value: T) => void, boolean] {
  const key = `${APP.slug}:${name}`;
  const fallback = useRef(defaultValue);
  fallback.current = defaultValue;
  const [stored, setStored] = useState<{ key: string | null; value: T }>({ key: null, value: defaultValue });
  useEffect(() => {
    let value = fallback.current;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) value = JSON.parse(raw) as T;
    } catch {
      // Unavailable or malformed storage uses this key's default.
    }
    setStored({ key, value });
  }, [key]);
  const setValue = useCallback((value: T) => {
    setStored({ key, value });
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // UI state remains usable without persistent storage.
    }
  }, [key]);
  return [stored.key === key ? stored.value : defaultValue, setValue, stored.key === key];
}
