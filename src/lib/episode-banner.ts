export type EpisodeBannerState =
  | { kind: "picks_open"; weekNumber: number; airsAtIso: string; picksModuleOn: boolean }
  | { kind: "on_air"; weekNumber: number; picksModuleOn: boolean };

// "On air" is derived from airs_at, not read from episodes.status — nothing
// in the app ever writes status='locked', so it can't be trusted as a signal.
export function computeEpisodeBannerState(input: {
  liveWeek: {
    week_number: number;
    earliestAirsAt: string | null;
    episodes: { status: string; airs_at: string }[];
  } | null;
  picksModuleOn: boolean;
  now?: Date;
}): EpisodeBannerState | null {
  const { liveWeek, picksModuleOn, now = new Date() } = input;
  if (!liveWeek || liveWeek.episodes.length === 0) return null;

  const isOnAir = liveWeek.episodes.some(
    (episode) => episode.status !== "completed" && now >= new Date(episode.airs_at)
  );

  if (isOnAir) {
    return { kind: "on_air", weekNumber: liveWeek.week_number, picksModuleOn };
  }

  // Not on air yet, so by construction no episode in this week has aired —
  // earliestAirsAt is the next airing, not just an arbitrary past one.
  return {
    kind: "picks_open",
    weekNumber: liveWeek.week_number,
    airsAtIso: liveWeek.earliestAirsAt!,
    picksModuleOn,
  };
}
