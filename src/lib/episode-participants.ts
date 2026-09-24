// No row for an episode in episode_participants means "unrestricted" (every
// currently-active couple participates) — this only ever filters something
// down on a split-broadcast episode (e.g. a two-night premiere where half
// the cast dances each night).
export function resolveEpisodeCoupleIds(
  activeCoupleIds: string[],
  participantCoupleIds: string[]
): string[] {
  if (participantCoupleIds.length === 0) return activeCoupleIds;
  const participants = new Set(participantCoupleIds);
  return activeCoupleIds.filter((id) => participants.has(id));
}

// A result row for a couple the schedule didn't put on this episode is only
// bookkeeping (the auto "safe" line for a split-broadcast night they sat out).
// Anything that says something happened — an elimination, withdrawal, finale
// placement, a judges' save or bonus, or dance scores — still shows.
export function isUnscheduledPlaceholderRow({
  participantCoupleIds,
  coupleId,
  outcome,
  hasDances,
  hasNotes,
}: {
  participantCoupleIds: string[] | undefined;
  coupleId: string;
  outcome: string;
  hasDances: boolean;
  hasNotes: boolean;
}): boolean {
  if (!participantCoupleIds || participantCoupleIds.length === 0) return false;
  if (participantCoupleIds.includes(coupleId)) return false;
  return (outcome === "safe" || outcome === "bye") && !hasDances && !hasNotes;
}
