export type EpisodeBannerState =
  | { kind: "picks_open"; weekNumber: number; airsAtIso: string; picksModuleOn: boolean }
  | { kind: "picks_locked"; weekNumber: number; airsAtIso: string }
  | { kind: "on_air"; weekNumber: number; picksModuleOn: boolean }
  | { kind: "results_soon"; weekNumber: number }
  | { kind: "results_in"; weekNumber: number }
  | { kind: "west_soon"; weekNumber: number }
  | { kind: "west_watching"; weekNumber: number };

// Matches the episodes.duration_minutes column default.
export const DEFAULT_EPISODE_DURATION_MINUTES = 120;

export type BannerEpisode = {
  airsAt: string;
  durationMinutes: number;
  completed: boolean;
  publishedAt: string | null;
};

export type BannerWeek = { weekNumber: number; episodes: BannerEpisode[] };

export type EpisodeBannerInput = {
  weeks: BannerWeek[];
  picksModuleOn: boolean;
  // Earliest Curtain Call lock across the viewer's leagues; null when none is on.
  curtainCallLockAtIso: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const RESULTS_IN_LEAD_MS = 48 * HOUR_MS;
const FINAL_RESULTS_HOLD_MS = 7 * 24 * HOUR_MS;
const WEST_FEED_START_HOUR = 20;
const WEST_FEED_END_HOUR = 22;
// Wide enough that the lock, air, West-feed and 10pm transitions on an episode
// night all land inside it.
const LIVE_WINDOW_MS = 6 * HOUR_MS;

const PACIFIC = "America/Los_Angeles";

function pacificParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)])
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour };
}

// The instant it is `hour`:00 Pacific on the same Pacific calendar day as `reference`.
function pacificClockOnSameDay(reference: Date, hour: number): Date {
  const { year, month, day } = pacificParts(reference);
  for (const utcOffsetHours of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + utcOffsetHours));
    const read = pacificParts(candidate);
    if (read.day === day && read.hour === hour) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 8));
}

function westFeedState(weeks: BannerWeek[], now: Date): EpisodeBannerState | null {
  for (const week of weeks) {
    for (const episode of week.episodes) {
      const airs = new Date(episode.airsAt);
      const eastEnd = new Date(airs.getTime() + episode.durationMinutes * 60 * 1000);
      const westStart = pacificClockOnSameDay(airs, WEST_FEED_START_HOUR);
      const westEnd = pacificClockOnSameDay(airs, WEST_FEED_END_HOUR);
      if (now >= westStart && now < westEnd) return { kind: "west_watching", weekNumber: week.weekNumber };
      if (now >= eastEnd && now < westStart) return { kind: "west_soon", weekNumber: week.weekNumber };
    }
  }
  return null;
}

function isComplete(week: BannerWeek): boolean {
  return week.episodes.length > 0 && week.episodes.every((episode) => episode.completed);
}

export type SeasonTrackModel = {
  weeksDone: number;
  // The week on the glowing circle; null when a finished season has no next week.
  currentWeek: number | null;
  upNext: boolean;
};

// Normally the banner's own week is the glowing circle and earlier completed
// weeks are checked. Once that week is fully published (Results in) it is
// checked too, and the circle moves on to the next week, labelled "up next".
export function seasonTrack(weeks: BannerWeek[], state: EpisodeBannerState): SeasonTrackModel {
  if (state.kind !== "results_in") {
    return {
      weeksDone: weeks.filter((week) => week.weekNumber < state.weekNumber && isComplete(week)).length,
      currentWeek: state.weekNumber,
      upNext: false,
    };
  }
  const nextWeek = weeks
    .filter((week) => week.weekNumber > state.weekNumber)
    .sort((a, b) => a.weekNumber - b.weekNumber)[0];
  return {
    weeksDone: weeks.filter((week) => week.weekNumber <= state.weekNumber && isComplete(week)).length,
    currentWeek: nextWeek?.weekNumber ?? null,
    upNext: true,
  };
}

function latestPublishedAt(week: BannerWeek): Date | null {
  const times = week.episodes.flatMap((episode) => (episode.publishedAt ? [new Date(episode.publishedAt)] : []));
  return times.length > 0 ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
}

export function computeEpisodeBannerState(
  input: EpisodeBannerInput,
  now: Date = new Date()
): EpisodeBannerState | null {
  const weeks = [...input.weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  const westFeed = westFeedState(weeks, now);
  if (westFeed) return westFeed;

  const liveIndex = weeks.findIndex((week) => !isComplete(week));
  const lastCompleted = weeks.slice(0, liveIndex === -1 ? weeks.length : liveIndex).filter(isComplete).at(-1);

  if (liveIndex === -1) {
    const publishedAt = lastCompleted ? latestPublishedAt(lastCompleted) : null;
    return lastCompleted && publishedAt && now.getTime() < publishedAt.getTime() + FINAL_RESULTS_HOLD_MS
      ? { kind: "results_in", weekNumber: lastCompleted.weekNumber }
      : null;
  }

  const live = weeks[liveIndex];
  const remaining = live.episodes
    .filter((episode) => !episode.completed)
    .sort((a, b) => a.airsAt.localeCompare(b.airsAt));
  const driver = remaining[0];
  if (!driver) return null;

  const airs = new Date(driver.airsAt);
  const untouched = remaining.length === live.episodes.length;
  if (lastCompleted && untouched && now.getTime() < airs.getTime() - RESULTS_IN_LEAD_MS) {
    return { kind: "results_in", weekNumber: lastCompleted.weekNumber };
  }

  const end = new Date(airs.getTime() + driver.durationMinutes * 60 * 1000);
  if (now >= end) return { kind: "results_soon", weekNumber: live.weekNumber };
  if (now >= airs) return { kind: "on_air", weekNumber: live.weekNumber, picksModuleOn: input.picksModuleOn };

  const lockAt = input.picksModuleOn && input.curtainCallLockAtIso ? new Date(input.curtainCallLockAtIso) : null;
  if (lockAt && now >= lockAt) {
    return { kind: "picks_locked", weekNumber: live.weekNumber, airsAtIso: driver.airsAt };
  }
  return {
    kind: "picks_open",
    weekNumber: live.weekNumber,
    airsAtIso: driver.airsAt,
    picksModuleOn: input.picksModuleOn,
  };
}

// Minute-by-minute around an episode's air time (when the state actually moves
// fast), otherwise wake daily or when the next window opens, whichever is first.
export function nextBannerRefreshMs(weeks: BannerWeek[], now: Date = new Date()): number {
  const airTimes = weeks.flatMap((week) => week.episodes.map((episode) => new Date(episode.airsAt).getTime()));
  if (airTimes.some((t) => Math.abs(now.getTime() - t) <= LIVE_WINDOW_MS)) return 60 * 1000;
  const untilNextWindow = Math.min(
    ...airTimes.filter((t) => t - LIVE_WINDOW_MS > now.getTime()).map((t) => t - LIVE_WINDOW_MS - now.getTime())
  );
  return Math.min(24 * HOUR_MS, untilNextWindow);
}
