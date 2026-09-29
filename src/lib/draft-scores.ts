import { computeWeeklyScores } from "./scoring";

// A night with at least one couple's drafted dance released (per couple, via
// draft_couple_releases -- someone with propose access, a commissioner or a
// site admin) and not yet officially published. Couples not listed in
// releasedCoupleIdsByEpisode may still be independently live-revealed via
// per-couple Publish -- that's a different, admin-only mechanism, and its
// couples must never be excluded here.
export type DraftRelease = {
  weekId: string;
  weekNumber: number;
  episodeIds: string[];
  releasedCoupleIdsByEpisode: Record<string, string[]>;
};

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

// Earliest unpublished night with at least one released couple. Later nights
// wait, the same way a revealing week is the earliest one with live scores.
export function findDraftRelease(
  episodes: DraftEpisode[],
  weekNumberById: ReadonlyMap<string, number>,
  releasedCoupleIdsByEpisode: ReadonlyMap<string, string[]>
): DraftRelease | null {
  const byWeek = new Map<
    string,
    { weekNumber: number; episodeIds: string[]; releasedCoupleIdsByEpisode: Record<string, string[]> }
  >();
  for (const episode of episodes) {
    if (!episode.week_id || episode.results_published_at) continue;
    const released = releasedCoupleIdsByEpisode.get(episode.id);
    if (!released || released.length === 0) continue;
    const weekNumber = weekNumberById.get(episode.week_id);
    if (weekNumber == null) continue;
    const existing = byWeek.get(episode.week_id);
    if (existing) {
      existing.episodeIds.push(episode.id);
      existing.releasedCoupleIdsByEpisode[episode.id] = released;
    } else {
      byWeek.set(episode.week_id, {
        weekNumber,
        episodeIds: [episode.id],
        releasedCoupleIdsByEpisode: { [episode.id]: released },
      });
    }
  }
  const earliest = [...byWeek.entries()].sort((a, b) => a[1].weekNumber - b[1].weekNumber)[0];
  if (!earliest) return null;
  return {
    weekId: earliest[0],
    weekNumber: earliest[1].weekNumber,
    episodeIds: earliest[1].episodeIds,
    releasedCoupleIdsByEpisode: earliest[1].releasedCoupleIdsByEpisode,
  };
}

// Excludes only the couples actually released in the draft from a set of
// live dance-score-shaped rows for the same episodes, then appends the
// draft's own rows for exactly those couples. A couple independently
// live-revealed via per-couple Publish (never in releasedCoupleIdsByEpisode)
// keeps its live row untouched, even in an episode that also has other
// couples still mid-draft.
export function excludeReleasedCoupleRows<T extends { episode_id: string; couple_id: string }>(
  rows: T[],
  releasedCoupleIdsByEpisode: Record<string, string[]>
): T[] {
  const released = new Set(
    Object.entries(releasedCoupleIdsByEpisode).flatMap(([episodeId, coupleIds]) =>
      coupleIds.map((coupleId) => `${episodeId}:${coupleId}`)
    )
  );
  return rows.filter((row) => !released.has(`${row.episode_id}:${row.couple_id}`));
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
  danceScores: { coupleId: string; totalScore: number }[];
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
// must stay, not get wiped by a lone released couple's draft dance.
export function replaceWeekDanceScores<T extends { weekNumber: number; danceScores: { coupleId: string; totalScore: number }[] }>(
  weeks: T[],
  draft: { weekNumber: number; danceScores: { coupleId: string; totalScore: number }[] } | null
): T[] {
  if (!draft) return weeks;
  const draftCoupleIds = new Set(draft.danceScores.map((d) => d.coupleId));
  return weeks.map((week) =>
    week.weekNumber === draft.weekNumber
      ? { ...week, danceScores: [...week.danceScores.filter((d) => !draftCoupleIds.has(d.coupleId)), ...draft.danceScores] }
      : week
  );
}
