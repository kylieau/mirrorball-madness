"use client";

import { useEffect, useRef } from "react";
import { makeAutoDraftPick } from "@/app/leagues/[id]/draft/actions";
import { autoPickTrigger, isBenignAutoPickError } from "@/lib/draft";

export function useAutoDraftPick({ leagueId, draftStatus, clockExpired, onTheClockAutopilot, turnKey, onError }: {
  leagueId: string; draftStatus: string; clockExpired: boolean; onTheClockAutopilot: boolean;
  turnKey: string | null; onError?: (message: string) => void;
}) {
  const inFlight = useRef<Promise<void> | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    const trigger = autoPickTrigger({ draftStatus, clockExpired, onTheClockAutopilot });
    if (!trigger) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A new turn can arrive before the previous request finishes. Wait for it
    // rather than silently dropping that turn's autopilot trigger.
    void (async () => {
      await inFlight.current;
      if (canceled) return;
      timer = setTimeout(() => {
        const request = makeAutoDraftPick(leagueId).then(({ error }) => {
          if (error && !isBenignAutoPickError(error)) onErrorRef.current?.(error);
        }).catch(() => onErrorRef.current?.("Could not confirm the automatic pick. Please refresh and try again."))
          .finally(() => { if (inFlight.current === request) inFlight.current = null; });
        inFlight.current = request;
      }, trigger === "autopilot" ? 1000 : 0);
    })();
    return () => { canceled = true; clearTimeout(timer); };
  }, [leagueId, draftStatus, clockExpired, onTheClockAutopilot, turnKey]);
}
