import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import { isTeamRow, PLAN_VERSION, recombinedTotal, scoringDance, settledBonuses, teamScoreRows, type PublicationSnapshot, type ScoringDance } from "./episode-publication";
import { buildWeeklyScoreRows, danceCardPriorWeeks, seasonFinaleWeek, type WeeklyScoreRow } from "./weekly-score-rows";
import { usesDanceCardLedger } from "./dance-card-v2";
import { roundPoints } from "./format-points";
import { scaledJudgesScore } from "./scoring";

type WeekRow = PublicationSnapshot["weeks"][number];

// Judges points only. Preserve already-paid sibling-night bonuses and
// predictions until official publication settles the whole week. A v1
// league moves by this night's change; a v2 league's credit isn't linear,
// so its Dance Card is the whole week rebuilt from everything live,
// published sibling nights' bonuses included.
function revealWeeklyScores(snapshot: PublicationSnapshot, week: WeekRow, episodeId: string, before: ScoringDance[], after: ScoringDance[]) {
  const v2Leagues = new Set(snapshot.settings.filter((row) => usesDanceCardLedger(row.dance_card_version)).map((row) => row.league_id));
  const laterWeek = (snapshot.laterWeeklyScores ?? []).find((row) => v2Leagues.has(row.league_id));
  if (laterWeek) {
    const number = snapshot.weeks.find((w) => w.id === laterWeek.week_id)?.week_number;
    throw new Error(`Week ${number} already has scores. Publish weeks in order.`);
  }
  const weekEpisodeIds = new Set(snapshot.episodes.filter((row) => row.week_id === week.id).map((row) => row.id));
  const danceCardInputs = {
    danceCardPriorWeeks: danceCardPriorWeeks(snapshot, week.week_number),
    danceCardWeekOutcomes: settledBonuses(snapshot, weekEpisodeIds),
  };
  const judgeRows = (dances: ScoringDance[]) => buildWeeklyScoreRows({
    dances, episodes: snapshot.episodes, outcomes: [], jeopardy: [], couples: snapshot.couples, leagues: snapshot.leagues,
    settings: snapshot.settings, rosters: snapshot.rosters, predictions: [], lateUnlocks: [], grandFinalePredictions: [],
    finaleWeekNumber: seasonFinaleWeek(snapshot.weeks),
    ...danceCardInputs,
  }, week, episodeId, [], { reveal: true });
  const key = (row: WeeklyScoreRow) => `${row.league_id}:${row.manager_id}`;
  const beforeRows = new Map(judgeRows(before).map((row) => [key(row), row]));
  const afterRows = new Map(judgeRows(after).map((row) => [key(row), row]));
  const storedRows = new Map((snapshot.weeklyScores ?? []).filter((row) => row.week_id === week.id).map((row) => [key(row), row]));
  return [...new Set([...afterRows.keys(), ...storedRows.keys()])].map((id) => {
    const stored = storedRows.get(id), afterRow = afterRows.get(id), beforeRow = beforeRows.get(id);
    const row = { ...(afterRow ?? stored!) };
    row.roster_points = v2Leagues.has(row.league_id)
      ? Number(afterRow?.roster_points ?? 0)
      : roundPoints(stored ? Number(stored.roster_points) + Number(afterRow?.roster_points ?? 0) - Number(beforeRow?.roster_points ?? 0) : Number(afterRow?.roster_points ?? 0));
    row.prediction_points = Number(stored?.prediction_points ?? 0);
    row.grand_finale_points = Number(stored?.grand_finale_points ?? 0);
    row.total_points = recombinedTotal(snapshot.settings, row, row.roster_points);
    return row;
  });
}

function weekLiveDances(snapshot: PublicationSnapshot, episodeId: string) {
  const episode = snapshot.episodes.find((row) => row.id === episodeId);
  if (!episode || episode.results_published_at) throw new Error("This episode's results are already published or unavailable");
  const week = snapshot.weeks.find((row) => row.id === episode.week_id) ?? null;
  const episodeIds = new Set(snapshot.episodes.filter((row) => week && row.week_id === week.id).map((row) => row.id));
  return { week, before: snapshot.dances.filter((row) => episodeIds.has(row.episode_id)) };
}

const scoringOnly = (row: ScoringDance): ScoringDance => scoringDance(row);

// Posting or un-posting a couple moves only their OWN rows; a team's row for
// that couple stays, exactly as commit_episode_reveal leaves it.
export function buildRevealPlan(snapshot: PublicationSnapshot, episodeId: string, coupleId: string, undo: boolean) {
  const { week, before } = weekLiveDances(snapshot, episodeId);
  if (!week) return { planVersion: PLAN_VERSION, weeklyScores: [] };
  const after: ScoringDance[] = before
    .filter((row) => !(row.episode_id === episodeId && row.couple_id === coupleId && !isTeamRow(row)))
    .map(scoringOnly);
  if (!undo) {
    if (before.some((row) => row.episode_id === episodeId && row.couple_id === coupleId && !isTeamRow(row))) throw new Error("This couple's scores are already posted");
    const drafts = snapshot.draftDances.filter((row) => row.episode_id === episodeId && row.couple_id === coupleId);
    if (!drafts.length) throw new Error("This couple has no saved dance scores");
    for (const dance of drafts) {
      const scores = snapshot.draftJudges.filter((row) => row.draft_dance_score_id === dance.id).map((row) => Number(row.score));
      if (!scores.length || scores.some((score) => !Number.isFinite(score) || score < 0 || score > 10)) throw new Error("Complete this couple's judge scores before posting");
      after.push({ episode_id: episodeId, couple_id: coupleId, total_score: scores.reduce((sum, score) => sum + score, 0), scaled_score: scaledJudgesScore(scores), max_score: null });
    }
  }
  return { planVersion: PLAN_VERSION, weeklyScores: revealWeeklyScores(snapshot, week, episodeId, before.map(scoringOnly), after) };
}

// Posting a special dance replaces its rows for every eligible member (a
// re-post rewrites a re-scored one in place); un-posting removes them. Dance
// Card is recomputed for the whole week from what is live, so a couple whose
// own dance was posted earlier moves from a one-dance night to the combined
// one.
export function buildTeamRevealPlan(snapshot: PublicationSnapshot, episodeId: string, teamId: string, undo: boolean) {
  const { week, before } = weekLiveDances(snapshot, episodeId);
  if (!snapshot.teams?.some((team) => team.id === teamId && team.episode_id === episodeId)) throw new Error("That special dance is no longer on this episode");
  if (!week) return { planVersion: PLAN_VERSION, weeklyScores: [] };
  const after: ScoringDance[] = before.filter((row) => row.team_id !== teamId).map(scoringOnly);
  if (!undo) after.push(...teamScoreRows(snapshot, episodeId, new Set([teamId])).map(scoringOnly));
  return { planVersion: PLAN_VERSION, weeklyScores: revealWeeklyScores(snapshot, week, episodeId, before.map(scoringOnly), after) };
}

export async function changeEpisodeReveal(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string }, actorId: string, undo: boolean) {
  const { data, error } = await admin.rpc("episode_publication_snapshot", { p_episode_id: input.episodeId });
  if (error) return { error: error.message };
  try {
    const plan = buildRevealPlan(data as unknown as PublicationSnapshot, input.episodeId, input.coupleId, undo);
    const result = await admin.rpc("commit_episode_reveal", {
      p_episode_id: input.episodeId, p_couple_id: input.coupleId, p_actor_id: actorId,
      p_snapshot: data, p_plan: plan as unknown as Json, p_undo: undo,
    });
    return { error: result.error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update live scores. Please try again." };
  }
}

export async function changeTeamReveal(admin: SupabaseClient<Database>, input: { episodeId: string; teamId: string }, actorId: string, undo: boolean) {
  const { data, error } = await admin.rpc("episode_publication_snapshot", { p_episode_id: input.episodeId });
  if (error) return { error: error.message };
  try {
    const plan = buildTeamRevealPlan(data as unknown as PublicationSnapshot, input.episodeId, input.teamId, undo);
    const result = await admin.rpc("commit_team_reveal", {
      p_episode_id: input.episodeId, p_team_id: input.teamId, p_actor_id: actorId,
      p_snapshot: data, p_plan: plan as unknown as Json, p_undo: undo,
    });
    return { error: result.error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update live scores. Please try again." };
  }
}
