export type DraftType = "snake" | "linear" | "custom";

// A round is the same slice of the board whatever the order rule is.
export function roundForPick(pickNumber: number, memberCount: number): number {
  return Math.floor((pickNumber - 1) / memberCount) + 1;
}

// Mirrors the pick-order math in the make_draft_pick Postgres function, for
// display only — the server is the actual authority on whose turn it is.
// Positional rules only: 'custom' has no draft_position to derive, so it goes
// through managerIdForPick instead.
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

// Presence is advisory only — the server never checks it, so it can't block
// or break a draft. `presentIds` may include people who are not members.
// A team counts as present if either half of a co-managed pair has the
// draft room open.
export function partitionPresence<T extends { user_id: string; co_manager_id: string | null }>(
  members: readonly T[],
  presentIds: ReadonlySet<string>
): { present: T[]; absent: T[] } {
  const present: T[] = [];
  const absent: T[] = [];
  for (const m of members) {
    const isPresent = presentIds.has(m.user_id) || (m.co_manager_id !== null && presentIds.has(m.co_manager_id));
    (isPresent ? present : absent).push(m);
  }
  return { present, absent };
}

// Keeps the commissioner's arrangement when membership changes in the lobby:
// leavers drop out, joiners go to the end.
export function reconcileOrder(
  order: readonly string[],
  memberIds: readonly string[]
): string[] {
  const current = new Set(memberIds);
  const kept = order.filter((id) => current.has(id));
  const known = new Set(kept);
  return [...kept, ...memberIds.filter((id) => !known.has(id))];
}

// Mirrors make_auto_draft_pick's queue rule: the highest-ranked queued couple
// that is still eligible, else null (caller falls back to random). Display /
// test only — the server is the authority.
export function pickFromQueue(
  queue: readonly string[],
  eligibleIds: ReadonlySet<string>
): string | null {
  return queue.find((id) => eligibleIds.has(id)) ?? null;
}

export function moveQueueEntry<T>(queue: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= queue.length) return [...queue];
  const next = [...queue];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Mirrors record_draft_pick's turn resolution across all three order rules:
// 'custom' names the manager for each pick outright, the others derive a
// draft_position. Display only — the server is the authority.
export function managerIdForPick(
  pickNumber: number,
  members: readonly { user_id: string; draft_position: number | null }[],
  draftType: DraftType = "snake",
  customPickOrder: readonly string[] | null = null
): string | null {
  if (draftType === "custom") return customPickOrder?.[pickNumber - 1] ?? null;

  const { draftPosition } = getPickAssignment(pickNumber, members.length, draftType);
  return members.find((m) => m.draft_position === draftPosition)?.user_id ?? null;
}

// The sequence a custom order starts from, so "Custom" opens on what the
// league would have done anyway rather than on something arbitrary.
export function buildSnakeSequence(orderedUserIds: readonly string[], rounds: number): string[] {
  const sequence: string[] = [];
  for (let round = 1; round <= rounds; round++) {
    sequence.push(...(round % 2 === 1 ? orderedUserIds : [...orderedUserIds].reverse()));
  }
  return sequence;
}

// Membership or the active cast moved under a saved custom order. A sequence
// that no longer gives every member exactly `rounds` picks can't be repaired
// in place, so it is rebuilt from snake — seeded with the commissioner's own
// round-one arrangement so their intent survives where it still can.
export function reconcileCustomOrder(
  current: readonly string[],
  memberIds: readonly string[],
  rounds: number
): string[] {
  const members = new Set(memberIds);
  const valid =
    rounds > 0 &&
    current.length === memberIds.length * rounds &&
    current.every((id) => members.has(id)) &&
    memberIds.every((id) => current.filter((x) => x === id).length === rounds);
  if (valid) return [...current];

  const firstRound = [...new Set(current.slice(0, memberIds.length))];
  return buildSnakeSequence(reconcileOrder(firstRound, memberIds), Math.max(rounds, 0));
}

// Rounds the lobby shows before start_draft derives roster_size: the same
// even split (active couples / members), so the grid matches the real draft.
export function predictedRounds(activeCoupleCount: number, memberCount: number): number {
  if (memberCount <= 0) return 0;
  return Math.floor(activeCoupleCount / memberCount);
}

// Swaps two adjacent picks inside one round of a custom sequence. Rounds are
// slices of the whole sequence, so a move never crosses a round boundary and
// each round stays a permutation of the members — which is what keeps
// "everyone gets the same number of picks" true by construction.
export function moveInCustomOrder(
  sequence: readonly string[],
  memberCount: number,
  roundIndex: number,
  indexInRound: number,
  direction: -1 | 1
): string[] {
  const target = indexInRound + direction;
  if (target < 0 || target >= memberCount) return [...sequence];

  const base = roundIndex * memberCount;
  const next = [...sequence];
  [next[base + indexInRound], next[base + target]] = [next[base + target], next[base + indexInRound]];
  return next;
}
