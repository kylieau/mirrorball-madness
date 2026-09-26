import {
  computeEpisodeBannerState,
  seasonTrack,
  type BannerEpisode,
  type BannerWeek,
  type EpisodeBannerInput,
  type EpisodeBannerState,
  type SeasonTrackModel,
} from "@/lib/episode-banner";

// Same instant the episode-banner tests use: 8pm ET / 5pm PT, Tuesday Sept 22, 2026.
const WEEK2_AIRS = "2026-09-23T00:00:00Z";
const LOCK_AT = "2026-09-22T20:00:00Z";

function episode(airsAt: string, overrides: Partial<BannerEpisode> = {}): BannerEpisode {
  return { airsAt, durationMinutes: 120, completed: false, publishedAt: null, ...overrides };
}

function season(week2: BannerEpisode): BannerWeek[] {
  return [
    {
      weekNumber: 1,
      episodes: [episode("2026-09-16T00:00:00Z", { completed: true, publishedAt: "2026-09-16T02:00:00Z" })],
    },
    { weekNumber: 2, episodes: [week2] },
    { weekNumber: 3, episodes: [episode("2026-09-30T00:00:00Z")] },
    { weekNumber: 4, episodes: [episode("2026-10-07T00:00:00Z")] },
  ];
}

export type CurtainStill = {
  id: string;
  file: string;
  nowIso: string;
  input: EpisodeBannerInput;
  state: EpisodeBannerState;
  rail: SeasonTrackModel;
  title: string;
  chip: string;
  subIncludes: string | null;
};

function curtain(spec: {
  id: string;
  file: string;
  nowIso: string;
  picksModuleOn: boolean;
  week2: BannerEpisode;
  kind: EpisodeBannerState["kind"];
  marker: SeasonTrackModel["marker"];
  currentWeek: number | null;
  title: string;
  chip: string;
  subIncludes: string | null;
}): CurtainStill {
  const input: EpisodeBannerInput = {
    weeks: season(spec.week2),
    picksModuleOn: spec.picksModuleOn,
    curtainCallLockAtIso: spec.picksModuleOn ? LOCK_AT : null,
  };
  const state = computeEpisodeBannerState(input, new Date(spec.nowIso));
  if (!state || state.kind !== spec.kind) {
    throw new Error(`${spec.id}: computed ${state?.kind ?? "null"}, wanted ${spec.kind}`);
  }
  const rail = seasonTrack(input.weeks, state);
  if (rail.marker !== spec.marker || rail.currentWeek !== spec.currentWeek) {
    throw new Error(
      `${spec.id}: rail ${rail.marker} week ${rail.currentWeek}, wanted ${spec.marker} week ${spec.currentWeek}`
    );
  }
  return {
    id: spec.id,
    file: spec.file,
    nowIso: spec.nowIso,
    input,
    state,
    rail,
    title: spec.title,
    chip: spec.chip,
    subIncludes: spec.subIncludes,
  };
}

const liveWeek = episode(WEEK2_AIRS);
const publishedWeek = episode(WEEK2_AIRS, { completed: true, publishedAt: "2026-09-23T06:00:00Z" });

export const CURTAIN_STILLS: CurtainStill[] = [
  curtain({
    id: "curtain-picks-open",
    file: "curtain-picks-open.png",
    nowIso: "2026-09-22T12:00:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "picks_open",
    marker: "next",
    currentWeek: 2,
    title: "Picks Open",
    chip: "Curtain Up Soon",
    subIncludes: "Live On Air",
  }),
  curtain({
    id: "curtain-picks-locked",
    file: "curtain-picks-locked.png",
    nowIso: "2026-09-22T22:00:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "picks_locked",
    marker: "next",
    currentWeek: 2,
    title: "Picks Locked",
    chip: "Curtain Up Soon",
    subIncludes: "Live On Air",
  }),
  curtain({
    id: "curtain-on-air-now",
    file: "curtain-on-air-now.png",
    nowIso: "2026-09-23T01:00:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "on_air",
    marker: "now",
    currentWeek: 2,
    title: "💃Let's Dance🕺",
    chip: "On Air Live ET",
    subIncludes: "Picks Locked · Time to Vote",
  }),
  curtain({
    id: "curtain-hold-the-curtain",
    file: "curtain-hold-the-curtain.png",
    nowIso: "2026-09-23T02:30:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "west_soon",
    marker: "next",
    currentWeek: 2,
    title: "Hold the Curtain",
    chip: "Spoiler Lockdown",
    subIncludes: "West Coast Showtime",
  }),
  curtain({
    id: "curtain-west-lets-dance",
    file: "curtain-west-lets-dance.png",
    nowIso: "2026-09-23T03:30:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "west_watching",
    marker: "now",
    currentWeek: 2,
    title: "💃Let's Dance🕺",
    chip: "On Air · Live PT",
    subIncludes: "No spoilers, darling",
  }),
  curtain({
    id: "curtain-results-soon",
    file: "curtain-results-soon.png",
    nowIso: "2026-09-23T06:00:00Z",
    picksModuleOn: true,
    week2: liveWeek,
    kind: "results_soon",
    marker: "now",
    currentWeek: 2,
    title: "Results Soon",
    chip: "Curtain Closed",
    subIncludes: "Tallying the scores",
  }),
  curtain({
    id: "curtain-scores-are-in",
    file: "curtain-scores-are-in.png",
    nowIso: "2026-09-24T18:00:00Z",
    picksModuleOn: true,
    week2: publishedWeek,
    kind: "results_in",
    marker: "next",
    currentWeek: 3,
    title: "Scores Are In",
    chip: "That's a Wrap",
    subIncludes: "See where you landed",
  }),
  curtain({
    id: "curtain-cc-off-curtain-up-soon",
    file: "curtain-cc-off-curtain-up-soon.png",
    nowIso: "2026-09-22T12:00:00Z",
    picksModuleOn: false,
    week2: liveWeek,
    kind: "picks_open",
    marker: "next",
    currentWeek: 2,
    title: "Curtain Up Soon",
    chip: "Curtain Up Soon",
    subIncludes: "Live On Air",
  }),
  curtain({
    id: "curtain-cc-off-time-to-vote",
    file: "curtain-cc-off-time-to-vote.png",
    nowIso: "2026-09-23T01:00:00Z",
    picksModuleOn: false,
    week2: liveWeek,
    kind: "on_air",
    marker: "now",
    currentWeek: 2,
    title: "💃Let's Dance🕺",
    chip: "On Air Live ET",
    subIncludes: "Time to Vote",
  }),
];

export function curtainById(id: string): CurtainStill | undefined {
  return CURTAIN_STILLS.find((scene) => scene.id === id);
}
