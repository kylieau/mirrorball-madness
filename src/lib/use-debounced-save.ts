"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved";

// Debounces a run of edits into one save. `save` resolves true on success.
// Lives with the caller (not the editing component) so a pending save survives
// the component remounting.
export function useDebouncedSave(delayMs = 500) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timeout = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => window.clearTimeout(timeout.current), []);

  const schedule = useCallback(
    (save: () => Promise<boolean>) => {
      setSaveState("saving");
      window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(async () => {
        setSaveState((await save()) ? "saved" : "idle");
      }, delayMs);
    },
    [delayMs]
  );

  useEffect(() => cancel, [cancel]);

  return { saveState, schedule, cancel };
}
