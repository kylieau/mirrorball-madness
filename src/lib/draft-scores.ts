import { computeWeeklyScores } from "./scoring";

// A night whose Enter Results draft a site admin has released
// (episodes.scores_drafted_at) and not yet officially published.
export type DraftRelease = {
  weekId: string;
  weekNumber: number;
  episodeIds: string[];
};

export const DRAFT_SCORES_STRIP_LABEL = "Draft scores · Site Admin to verify";

export const DRAFT_SCORES_SHEET = {
  title: "Draft scores",
  body: "Site Admin has drafted tonight's scores before official publish. Standings may update from these drafts and can change when scores are verified and published.",
  primary: "Got it",
} as const;

type DraftEpisode = {
  id: string;
  week_id: string | null;
  results_published_at: string | null;
  scores_drafted_at: string | null;
};

// Earliest unpublished night with a released draft. Later nights wait, the
// same way a revealing week is the earliest one with live dance scores.
export function findDraftRelease(
  episodes: DraftEpisode[],
  weekNumberById: ReadonlyMap<string, number>
): DraftRelease | null {
  const byWeek = new Map<string, { weekNumber: number; episodeIds: string[] }>();
  for (const episode of episodes) {
    if (!episode.week_id || !episode.scores_drafted_at || episode.results_published_at) continue;
    const weekNumber = weekNumberById.get(episode.week_id);
    if (weekNumber == null) continue;
    const existing = byWeek.get(episode.week_id);
    if (existing) existing.episodeIds.push(episode.id);
    else byWeek.set(episode.week_id, { weekNumber, episodeIds: [episode.id] });
  }
  const earliest = [...byWeek.entries()].sort((a, b) => a[1].weekNumber - b[1].weekNumber)[0];
  if (!earliest) return null;
  return { weekId: earliest[0], weekNumber: earliest[1].weekNumber, episodeIds: earliest[1].episodeIds };
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

export function replaceWeekDanceScores<T extends { weekNumber: number; danceScores: { coupleId: string; totalScore: number }[] }>(
  weeks: T[],
  draft: { weekNumber: number; danceScores: { coupleId: string; totalScore: number }[] } | null
): T[] {
  if (!draft) return weeks;
  return weeks.map((week) => (week.weekNumber === draft.weekNumber ? { ...week, danceScores: draft.danceScores } : week));
}
