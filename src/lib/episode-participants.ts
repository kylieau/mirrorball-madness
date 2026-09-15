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
