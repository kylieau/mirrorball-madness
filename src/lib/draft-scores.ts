import { buildCoupleDisplayNames, formatCoupleName } from "./couple-display";
import { slotActiveInWeek } from "./roster-couple-points";
import { computeWeeklyScores, type DanceScore } from "./scoring";

// A night with at least one drafted dance released (a couple's own, via
// draft_couple_releases, or a special dance's, via draft_special_releases --
// someone with propose access) and not yet officially published. Couples not
// listed in releasedCoupleIdsByEpisode may still be independently live-revealed
// via per-couple Publish -- that's a different, admin-only mechanism, and its
// couples must never be excluded here. A released special dance is never
// posted (the read hides posted ones), so it has no live rows to stand in for
// and its members never belong in releasedCoupleIdsByEpisode.
export type DraftRelease = {
  weekId: string;
  weekNumber: number;
  episodeIds: string[];
  releasedCoupleIdsByEpisode: Record<string, string[]>;
  releasedTeamIdsByEpisode: Record<string, string[]>;
};

// One released draft dance as the readers receive it: a couple's own (teamId
// null, maxScore null like any one-dance row) or one participant's row of a
// released special dance, shaped as posting would write it.
export type DraftDance = {
  episodeId: string;
  coupleId: string;
  teamId: string | null;
  danceStyle: string;
  total: number;
  scaled: number;
  maxScore: number | null;
  at: string;
};

// A release read just before its dance was posted can arrive beside the
// posted rows from a separate read; the posted rows win.
export function unpostedDraftDances(dances: DraftDance[], liveTeamIds: Iterable<string | null | undefined>): DraftDance[] {
  const posted = new Set([...liveTeamIds].filter((id): id is string => id != null));
  return dances.filter((dance) => dance.teamId == null || !posted.has(dance.teamId));
}

export function draftDanceScores(dances: DraftDance[]): DanceScore[] {
  return dances.map((dance) => ({
    episodeId: dance.episodeId,
    coupleId: dance.coupleId,
    totalScore: dance.total,
    scaledScore: dance.scaled,
    maxScore: dance.maxScore,
    teamId: dance.teamId,
  }));
}

// "Ciara & Brandon · 3/8" under "Draft scores available": the latest release
// (a couple by short first names, or a special dance by its name), then the
// couples with any released dance over the couples dancing that week
// (everyone not already out before it).
export function draftReleaseLabel(input: {
  latest: { coupleId: string } | { specialName: string };
  releasedCoupleIds: readonly string[];
  weekNumber: number;
  seasonCouples: readonly {
    id: string;
    celebrity_name: string;
    pro_name: string;
    status: string;
    elimination_week: number | null;
  }[];
}): string | null {
  let latest: string;
  if ("specialName" in input.latest) latest = input.latest.specialName;
  else {
    const parts = buildCoupleDisplayNames([...input.seasonCouples]).get(input.latest.coupleId);
    if (!parts) return null;
    latest = formatCoupleName(parts);
  }
  const dancing = input.seasonCouples.filter(
    (c) =>
      !((c.status === "eliminated" || c.status === "withdrawn") && c.elimination_week != null && c.elimination_week < input.weekNumber)
  ).length;
  return `${latest} · ${new Set(input.releasedCoupleIds).size}/${dancing}`;
}

export const DRAFT_SCORES_STRIP_LABEL = "Draft scores · Unverified";

export const DRAFT_SCORES_SHEET = {
  title: "Draft scores",
  body: "Tonight's scores are drafted before official publish. Standings may update from these drafts and can change when scores are verified and published.",
  primary: "Got it",
} as const;

type DraftEpisode = {
  id: string;
  week_id: string | null;
  results_published_at: string | null;
};

// Earliest unpublished night with at least one released couple or special
// dance. Later nights wait, the same way a revealing week is the earliest one
// with live scores.
export function findDraftRelease(
  episodes: DraftEpisode[],
  weekNumberById: ReadonlyMap<string, number>,
  releasedCoupleIdsByEpisode: ReadonlyMap<string, string[]>,
  releasedTeamIdsByEpisode: ReadonlyMap<string, string[]> = new Map()
): DraftRelease | null {
  const byWeek = new Map<string, Omit<DraftRelease, "weekId">>();
  for (const episode of episodes) {
    if (!episode.week_id || episode.results_published_at) continue;
    const couples = releasedCoupleIdsByEpisode.get(episode.id) ?? [];
    const teams = releasedTeamIdsByEpisode.get(episode.id) ?? [];
    if (couples.length === 0 && teams.length === 0) continue;
    const weekNumber = weekNumberById.get(episode.week_id);
    if (weekNumber == null) continue;
    const week = byWeek.get(episode.week_id) ?? { weekNumber, episodeIds: [], releasedCoupleIdsByEpisode: {}, releasedTeamIdsByEpisode: {} };
    week.episodeIds.push(episode.id);
    if (couples.length > 0) week.releasedCoupleIdsByEpisode[episode.id] = couples;
    if (teams.length > 0) week.releasedTeamIdsByEpisode[episode.id] = teams;
    byWeek.set(episode.week_id, week);
  }
  const earliest = [...byWeek.entries()].sort((a, b) => a[1].weekNumber - b[1].weekNumber)[0];
  return earliest ? { weekId: earliest[0], ...earliest[1] } : null;
}

// Excludes only the couples actually released in the draft from a set of
// live dance-score-shaped rows for the same episodes, then appends the
// draft's own rows for exactly those couples. A couple independently
// live-revealed via per-couple Publish (never in releasedCoupleIdsByEpisode)
// keeps its live row untouched, even in an episode that also has other
// couples still mid-draft. A posted special dance's row (team_id) stays too:
// the draft holds only the couple's own dances.
export function excludeReleasedCoupleRows<T extends { episode_id: string; couple_id: string; team_id?: string | null }>(
  rows: T[],
  releasedCoupleIdsByEpisode: Record<string, string[]>
): T[] {
  const released = new Set(
    Object.entries(releasedCoupleIdsByEpisode).flatMap(([episodeId, coupleIds]) =>
      coupleIds.map((coupleId) => `${episodeId}:${coupleId}`)
    )
  );
  return rows.filter((row) => row.team_id != null || !released.has(`${row.episode_id}:${row.couple_id}`));
}

// Mark Watched (finished the East broadcast) raises draft_unlocked_week.
// Stay Updated only raises last_watched_week, so a live watcher does not
// clear this gate.
export function draftScoresVisible(draftUnlockedWeek: number, weekNumber: number): boolean {
  return weekNumber > 0 && draftUnlockedWeek >= weekNumber;
}

// The Live Scores Prompt's week. A released draft counts as posting even
// before any couple is live-posted, so Mark Watched has a path to unlock it.
// An in-progress live reveal still wins when the viewer is behind on that week.
export function postingWeekNumber(input: {
  lastWatchedWeek: number;
  revealingWeekNumber: number | null;
  draftReleaseWeekNumber: number | null;
}): number | null {
  if (input.revealingWeekNumber != null && input.lastWatchedWeek < input.revealingWeekNumber) {
    return input.revealingWeekNumber;
  }
  if (input.draftReleaseWeekNumber != null && input.lastWatchedWeek < input.draftReleaseWeekNumber) {
    return input.draftReleaseWeekNumber;
  }
  return null;
}

// One sticky strip. A visible draft replaces the Spoiler-Free strip.
export function homeStripChoice(draftVisible: boolean, spoilerStrip: boolean): "draft" | "spoiler-free" | "none" {
  if (draftVisible) return "draft";
  if (spoilerStrip) return "spoiler-free";
  return "none";
}

export type DraftManagerScore = {
  managerId: string;
  rosterPoints: number;
  totalPoints: number;
};

// Judges points only, matching a live reveal: no survival, Curtain Call, or
// Grand Finale until official publish. Weeks before the league's Anchor Week
// pay nothing.
export function draftWeekManagerScores(input: {
  weekNumber: number;
  anchorWeek: number;
  judgesScoreMultiplier: number;
  judgesCategoryWeight: number;
  rosterSlots: { managerId: string; coupleId: string }[];
  danceScores: DanceScore[];
}): DraftManagerScore[] {
  if (input.weekNumber < input.anchorWeek || input.danceScores.length === 0 || input.rosterSlots.length === 0) {
    return [];
  }
  return computeWeeklyScores({
    scoringSettings: {
      judgesScoreMultiplier: input.judgesScoreMultiplier,
      survivalPoints: 0,
      eliminationPredictionPoints: 0,
      topScorerPredictionPoints: 0,
      firstPlacePoints: 0,
      secondPlacePoints: 0,
      thirdPlacePoints: 0,
      fourthPlacePoints: 0,
      fifthPlacePoints: 0,
      curtainCallNearMissEnabled: false,
    },
    rosterSlots: input.rosterSlots,
    danceScores: input.danceScores,
    episodeOutcomes: [],
    predictions: [],
    isDoubleElimination: false,
    couplesRemaining: 1,
    totalCouples: 1,
    categoryWeights: { judges: input.judgesCategoryWeight, eliminations: 1, bonus: 1 },
  }).map((row) => ({
    managerId: row.managerId,
    rosterPoints: row.rosterPoints,
    totalPoints: row.totalPoints,
  }));
}

// Every dance that counts toward a draft night's judges points: the released
// drafts (couples' own dances and released special dances) plus the week's
// live rows (couples posted on their own and posted special dances), minus a
// released couple's own live rows, which the draft stands in for.
export function draftNightDanceScores(night: {
  releasedCoupleIdsByEpisode: Record<string, string[]>;
  dances: DraftDance[];
  liveDances: DanceScore[];
}): DanceScore[] {
  const released = new Set(
    Object.entries(night.releasedCoupleIdsByEpisode).flatMap(([episodeId, coupleIds]) =>
      coupleIds.map((coupleId) => `${episodeId}:${coupleId}`)
    )
  );
  return [
    ...night.liveDances.filter((d) => d.teamId != null || !released.has(`${d.episodeId}:${d.coupleId}`)),
    ...draftDanceScores(unpostedDraftDances(night.dances, night.liveDances.map((d) => d.teamId))),
  ];
}

// The league's draft-night standings from rows the page already loaded: only
// roster periods that held a couple that week count.
export function draftManagerScoresForNight(
  settings: {
    judges_score_multiplier: number;
    judges_score_category_weight: number;
    judges_score_starts_week: number;
  },
  slots: { manager_id: string; couple_id: string | null; start_week: number; end_week: number | null }[],
  night: { weekNumber: number; danceScores: DanceScore[] }
): DraftManagerScore[] {
  const rosterSlots = slots.flatMap((slot) => {
    if (!slot.couple_id) return [];
    const period = {
      managerId: slot.manager_id,
      coupleId: slot.couple_id,
      startWeek: slot.start_week,
      endWeek: slot.end_week,
    };
    return slotActiveInWeek(period, night.weekNumber) ? [{ managerId: period.managerId, coupleId: period.coupleId }] : [];
  });
  return draftWeekManagerScores({
    weekNumber: night.weekNumber,
    anchorWeek: settings.judges_score_starts_week,
    judgesScoreMultiplier: settings.judges_score_multiplier,
    judgesCategoryWeight: settings.judges_score_category_weight,
    rosterSlots,
    danceScores: night.danceScores,
  });
}

export type WeekManagerScoreRow = {
  week_id: string;
  manager_id: string;
  roster_points: number;
  prediction_points: number;
  grand_finale_points: number;
  total_points: number;
};

// Swap the stored week (live-reveal judges points, possibly partial) for the
// full draft. An empty draft does not wipe points already posted.
export function scoresReplacingDraftWeek(
  rows: WeekManagerScoreRow[],
  weekId: string,
  managers: DraftManagerScore[]
): WeekManagerScoreRow[] {
  if (managers.length === 0) return rows;
  return [
    ...rows.filter((row) => row.week_id !== weekId),
    ...managers.map((manager) => ({
      week_id: weekId,
      manager_id: manager.managerId,
      roster_points: manager.rosterPoints,
      prediction_points: 0,
      grand_finale_points: 0,
      total_points: manager.totalPoints,
    })),
  ];
}

// Merges rather than replaces: draft.danceScores only ever contains released
// couples (per-couple, not the whole night), so any other couple's entry for
// this week -- e.g. one independently live-revealed via per-couple Publish --
// must stay, not get wiped by a lone released couple's draft dance. Keyed by
// night and couple, never couple alone: a two-night week can hold a couple's
// live rows for one night beside their released draft for the other. Only a
// couple's own drafted dances stand in for its live own rows: a posted special
// dance's row stays, and a released special dance's draft row replaces
// nothing (it is never also posted).
export function replaceWeekDanceScores<T extends { weekNumber: number; danceScores: DanceScore[] }>(
  weeks: T[],
  draft: { weekNumber: number; danceScores: DanceScore[] } | null
): T[] {
  if (!draft) return weeks;
  const nightKey = (d: DanceScore) => `${d.episodeId}:${d.coupleId}`;
  const draftNights = new Set(draft.danceScores.filter((d) => d.teamId == null).map(nightKey));
  return weeks.map((week) => {
    if (week.weekNumber !== draft.weekNumber) return week;
    const postedTeams = new Set(week.danceScores.map((d) => d.teamId).filter((id) => id != null));
    return {
      ...week,
      danceScores: [
        ...week.danceScores.filter((d) => d.teamId != null || !draftNights.has(nightKey(d))),
        ...draft.danceScores.filter((d) => d.teamId == null || !postedTeams.has(d.teamId)),
      ],
    };
  });
}
