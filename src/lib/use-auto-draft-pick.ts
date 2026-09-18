"use client";

import { useEffect, useRef } from "react";
import { makeAutoDraftPick } from "@/app/leagues/[id]/draft/actions";
import { autoPickTrigger, isBenignAutoPickError } from "@/lib/draft";

const AUTOPILOT_CHAIN_DELAY_MS = 1000;

export function useAutoDraftPick({
  leagueId,
  draftStatus,
  clockExpired,
  onTheClockAutopilot,
  onError,
}: {
  leagueId: string;
  draftStatus: string;
  clockExpired: boolean;
  onTheClockAutopilot: boolean;
  onError?: (message: string) => void;
}) {
  const inFlight = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const trigger = autoPickTrigger({
      draftStatus,
      clockExpired,
      onTheClockAutopilot,
    });
    if (!trigger || inFlight.current) return;

    // One visible pick per trigger. Autopilot chains get a beat so the log
    // doesn't drain in a blur; timeout never chains — the next clock starts fresh.
    const delay = trigger === "autopilot" ? AUTOPILOT_CHAIN_DELAY_MS : 0;
    const timeoutId = window.setTimeout(() => {
      inFlight.current = true;
      void makeAutoDraftPick(leagueId).then(({ error }) => {
        inFlight.current = false;
        if (error && !isBenignAutoPickError(error)) {
          onErrorRef.current?.(error);
        }
      });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [leagueId, draftStatus, clockExpired, onTheClockAutopilot]);
}
