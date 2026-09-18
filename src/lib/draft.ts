// Mirrors the pick-order math in the make_draft_pick Postgres function, for
// display only — the server is the actual authority on whose turn it is.
export function getPickAssignment(
  pickNumber: number,
  memberCount: number,
  draftType: "snake" | "linear" = "snake"
) {
  const round = Math.floor((pickNumber - 1) / memberCount) + 1;
  const positionInRound = pickNumber - (round - 1) * memberCount;
  const draftPosition =
    draftType === "linear" || round % 2 === 1
      ? positionInRound
      : memberCount - positionInRound + 1;
  return { round, draftPosition };
}

// Uniform choice among eligible remaining couples — same rule as
// make_auto_draft_pick (`order by random()`). No ADP, rankings, or
// team-needs. `rng` must return a number in [0, 1) (Math.random's range);
// inject a stub in tests.
export function pickRandomEligible<T>(
  eligible: readonly T[],
  rng: () => number = Math.random
): T | null {
  if (eligible.length === 0) return null;
  const raw = rng();
  const unit = Number.isFinite(raw) ? raw : 0;
  const bounded = unit >= 1 ? 0 : unit < 0 ? 0 : unit;
  return eligible[Math.floor(bounded * eligible.length)] ?? null;
}

export function eligibleRemaining<T extends { id: string }>(
  all: readonly T[],
  draftedIds: ReadonlySet<string>
): T[] {
  return all.filter((item) => !draftedIds.has(item.id));
}

export function secondsRemainingOnClock(
  turnStartedAtIso: string | null | undefined,
  pickTimeLimitSeconds: number,
  nowMs: number
): number {
  if (!turnStartedAtIso) return pickTimeLimitSeconds;
  const startMs = Date.parse(turnStartedAtIso);
  if (Number.isNaN(startMs)) return pickTimeLimitSeconds;
  return Math.max(pickTimeLimitSeconds - Math.floor((nowMs - startMs) / 1000), 0);
}

export type AutoPickTrigger = "timeout" | "autopilot";

export function autoPickTrigger(opts: {
  draftStatus: string;
  clockExpired: boolean;
  onTheClockAutopilot: boolean;
}): AutoPickTrigger | null {
  if (opts.draftStatus !== "in_progress") return null;
  if (opts.onTheClockAutopilot) return "autopilot";
  if (opts.clockExpired) return "timeout";
  return null;
}

// Concurrent viewers all fire make_auto_draft_pick when the clock expires;
// the league row lock lets one win and the rest land on these.
export function isBenignAutoPickError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Not eligible for an auto-pick yet") ||
    message.includes("Draft is not in progress") ||
    message.includes("Draft is already complete")
  );
}
