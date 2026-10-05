export type EpisodeBannerState =
  | { kind: "picks_open"; weekNumber: number; airsAtIso: string; picksModuleOn: boolean }
  | { kind: "picks_locked"; weekNumber: number; airsAtIso: string }
  | { kind: "on_air"; weekNumber: number; picksModuleOn: boolean }
  | { kind: "results_soon"; weekNumber: number }
  | { kind: "results_in"; weekNumber: number }
  | { kind: "west_soon"; weekNumber: number; westStartIso: string }
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
const RESULTS_IN_HOLD_MS = 48 * HOUR_MS;
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
      if (now >= eastEnd && now < westStart) {
        return { kind: "west_soon", weekNumber: week.weekNumber, westStartIso: westStart.toISOString() };
      }
    }
  }
  return null;
}

export type LiveAirPhase = { kind: "east" | "gap" | "west"; weekNumber: number };

export type RefreshWindow = { startMs: number; endMs: number };

const REFRESH_LEAD_MS = 30 * 60 * 1000;

// Each episode night from 30 minutes before the East curtain to the end of
// the West feed, not yet over. Pages auto-refresh inside these (checked on the
// client), so a page opened before the show still picks up the first posted
// scores and the live-air prompt without a reload.
export function liveRefreshWindows(weeks: BannerWeek[], now: Date = new Date()): RefreshWindow[] {
  return weeks
    .flatMap((week) => week.episodes)
    .map((episode) => {
      const airs = new Date(episode.airsAt);
      return {
        startMs: airs.getTime() - REFRESH_LEAD_MS,
        endMs: pacificClockOnSameDay(airs, WEST_FEED_END_HOUR).getTime(),
      };
    })
    .filter((window) => window.endMs > now.getTime());
}

// Where tonight's broadcast is for everyone: the East live window, the gap
// before the West feed, or the West window (8-10pm PT). Null otherwise.
export function liveAirPhase(weeks: BannerWeek[], now: Date = new Date()): LiveAirPhase | null {
  for (const week of weeks) {
    for (const episode of week.episodes) {
      const airs = new Date(episode.airsAt);
      const eastEnd = new Date(airs.getTime() + episode.durationMinutes * 60 * 1000);
      const westStart = pacificClockOnSameDay(airs, WEST_FEED_START_HOUR);
      const westEnd = pacificClockOnSameDay(airs, WEST_FEED_END_HOUR);
      if (now >= airs && now < eastEnd) return { kind: "east", weekNumber: week.weekNumber };
      if (now >= eastEnd && now < westStart) return { kind: "gap", weekNumber: week.weekNumber };
      if (now >= westStart && now < westEnd) return { kind: "west", weekNumber: week.weekNumber };
    }
  }
  return null;
}

// Shapes a season's grouped weeks for the banner and live-air helpers.
export function toBannerWeeks(
  weeks: {
    week_number: number;
    episodes: { airs_at: string; duration_minutes?: number | null; status: string; results_published_at?: string | null }[];
  }[]
): BannerWeek[] {
  return weeks.map((week) => ({
    weekNumber: week.week_number,
    episodes: week.episodes.map((episode) => ({
      airsAt: episode.airs_at,
      durationMinutes: episode.duration_minutes ?? DEFAULT_EPISODE_DURATION_MINUTES,
      completed: episode.status === "completed",
      publishedAt: episode.results_published_at ?? null,
    })),
  }));
}

function isComplete(week: BannerWeek): boolean {
  return week.episodes.length > 0 && week.episodes.every((episode) => episode.completed);
}

const LIVE_MARKER_KINDS = new Set<EpisodeBannerState["kind"]>(["on_air", "west_watching", "results_soon"]);

export type SeasonTrackModel = {
  weeksDone: number;
  // The week on the glowing circle; null when a finished season has no next week.
  currentWeek: number | null;
  // "now" while that week is on air or awaiting results, "next" while it is still to come.
  marker: "now" | "next";
};

// Normally the banner's own week is the glowing circle and earlier completed
// weeks are checked. Once that week is fully published (Results in) it is
// checked too, and the circle moves on to the next week.
export function seasonTrack(weeks: BannerWeek[], state: EpisodeBannerState): SeasonTrackModel {
  if (state.kind !== "results_in") {
    return {
      weeksDone: weeks.filter((week) => week.weekNumber < state.weekNumber && isComplete(week)).length,
      currentWeek: state.weekNumber,
      marker: LIVE_MARKER_KINDS.has(state.kind) ? "now" : "next",
    };
  }
  const nextWeek = weeks
    .filter((week) => week.weekNumber > state.weekNumber)
    .sort((a, b) => a.weekNumber - b.weekNumber)[0];
  return {
    weeksDone: weeks.filter((week) => week.weekNumber <= state.weekNumber && isComplete(week)).length,
    currentWeek: nextWeek?.weekNumber ?? null,
    marker: "next",
  };
}

// Total season length isn't known, so the track shows what's done, the
// current week, and hollow dots that fade out instead of a real "N of M". It
// never grows past seven nodes: once more than three weeks are checked the
// earliest fall off the left (hiddenDone), or the row would clip at 360px.
export const TRACK_NODES = 7;
const MIN_FUTURE_DOTS = 3;
const MAX_DONE_DOTS = TRACK_NODES - 1 - MIN_FUTURE_DOTS;

export type TrackDot = { kind: "done"; label: "✓" } | { kind: "current"; label: string } | { kind: "future"; label: "" };

export function trackDots({ weeksDone, currentWeek }: SeasonTrackModel): { dots: TrackDot[]; hiddenDone: number } {
  const visibleDone = Math.min(weeksDone, MAX_DONE_DOTS);
  const dots: TrackDot[] = [
    ...Array.from({ length: visibleDone }, () => ({ kind: "done" as const, label: "✓" as const })),
    ...(currentWeek === null ? [] : [{ kind: "current" as const, label: String(currentWeek) }]),
    ...Array.from({ length: Math.max(MIN_FUTURE_DOTS, TRACK_NODES - 1 - visibleDone) }, () => ({
      kind: "future" as const,
      label: "" as const,
    })),
  ];
  return { dots, hiddenDone: weeksDone - visibleDone };
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

  const publishedAt = lastCompleted ? latestPublishedAt(lastCompleted) : null;
  const heldFor = (holdMs: number) => !!publishedAt && now.getTime() < publishedAt.getTime() + holdMs;

  if (liveIndex === -1) {
    return lastCompleted && heldFor(FINAL_RESULTS_HOLD_MS)
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
  if (lastCompleted && untouched && heldFor(RESULTS_IN_HOLD_MS) && now.getTime() < airs.getTime() - RESULTS_IN_LEAD_MS) {
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
  const nowMs = now.getTime();
  const episodes = weeks.flatMap((week) => week.episodes);
  const airTimes = episodes.map((episode) => new Date(episode.airsAt).getTime());
  if (airTimes.some((t) => Math.abs(nowMs - t) <= LIVE_WINDOW_MS)) return 60 * 1000;
  const resultsInExpiries = episodes.flatMap((episode) =>
    episode.publishedAt
      ? [RESULTS_IN_HOLD_MS, FINAL_RESULTS_HOLD_MS].map((holdMs) => new Date(episode.publishedAt!).getTime() + holdMs)
      : []
  );
  const untilNextChange = Math.min(
    ...airTimes.filter((t) => t - LIVE_WINDOW_MS > nowMs).map((t) => t - LIVE_WINDOW_MS - nowMs),
    ...resultsInExpiries.filter((t) => t > nowMs).map((t) => t - nowMs)
  );
  return Math.min(24 * HOUR_MS, untilNextChange);
}
