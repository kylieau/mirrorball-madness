import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import { buildWeeklyScoreRows, type WeeklyScoreRow } from "./weekly-score-rows";
import {
  inJeopardyIdsToPersist,
  RESOLVING_OUTCOMES,
  scaledJudgesScore,
  type Outcome,
} from "./scoring";
import { unpostedCoupleIds } from "./reveal-state";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type PublicationSnapshot = {
  _revision?: string;
  weeklyScores?: WeeklyScoreRow[];
  season: Row<"seasons"> | null;
  episodes: Row<"episodes">[];
  weeks: Row<"competition_weeks">[];
  couples: Row<"couples">[];
  dances: Row<"dance_scores">[];
  outcomes: Row<"episode_results">[];
  jeopardy: Row<"episode_in_jeopardy_couples">[];
  leagues: Row<"leagues">[];
  settings: Row<"scoring_settings">[];
  rosters: Row<"roster_slots">[];
  predictions: Row<"predictions">[];
  lateUnlocks: Row<"grand_finale_late_unlocks">[];
  grandFinalePredictions: Row<"grand_finale_predictions">[];
  draftOverrides: Row<"draft_episode_overrides">[];
  draftDances: Row<"draft_dance_scores">[];
  draftJudges: Row<"draft_judge_scores">[];
  draftResults: Row<"draft_episode_results">[];
  draftJeopardy: Row<"draft_episode_in_jeopardy_couples">[];
  draftMoments: Row<"draft_episode_custom_moments">[];
};
export type PublicationPlan = {
  coupleUpdates: Pick<Row<"couples">, "id" | "status" | "elimination_week">[];
  futureEpisodeIds: string[];
  weeklyScores: WeeklyScoreRow[];
};

export function buildPublicationPlan(
  snapshot: PublicationSnapshot,
  episodeId: string
): PublicationPlan {
  const episode = snapshot.episodes.find((e) => e.id === episodeId);
  if (!episode || !snapshot.season || episode.season_id !== snapshot.season.id)
    throw new Error("Episode not found in the active season");
  if (!snapshot.draftOverrides.some((r) => r.episode_id === episodeId))
    throw new Error("No draft to publish for this episode");
  const entries = snapshot.draftResults.filter((r) => r.episode_id === episodeId);
  if (entries.length === 0) throw new Error("No results to publish for this episode");
  const drafts = snapshot.draftDances.filter((r) => r.episode_id === episodeId);
  const preserved = new Set(
    episode.results_published_at
      ? []
      : snapshot.dances.filter((d) => d.episode_id === episodeId).map((d) => d.couple_id)
  );
  const unposted = unpostedCoupleIds(
    drafts.map((d) => ({ coupleId: d.couple_id })),
    preserved
  );
  if (unposted.length > 0)
    throw new Error(
      `Post every couple's scores before publishing results (${unposted.length} still to post).`
    );
  const week = snapshot.weeks.find((w) => w.id === episode.week_id);
  const nowResolved = new Set(
    entries.filter((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome)).map((r) => r.couple_id)
  );
  const previouslyResolved = new Set(
    snapshot.outcomes
      .filter((r) => r.episode_id === episodeId && RESOLVING_OUTCOMES.has(r.outcome as Outcome))
      .map((r) => r.couple_id)
  );
  const siblingIds = new Set(
    week
      ? snapshot.episodes
          .filter((e) => e.week_id === week.id && e.id !== episodeId)
          .map((e) => e.id)
      : []
  );
  const siblingResolved = new Set(
    snapshot.outcomes
      .filter((r) => siblingIds.has(r.episode_id) && RESOLVING_OUTCOMES.has(r.outcome as Outcome))
      .map((r) => r.couple_id)
  );
  const couples = snapshot.couples.map((c) => {
    const entry = entries.find((r) => r.couple_id === c.id);
    if (week && entry && nowResolved.has(c.id))
      return {
        ...c,
        status: entry.outcome,
        elimination_week: ["eliminated", "withdrawn"].includes(entry.outcome)
          ? week.week_number
          : null,
      };
    if (previouslyResolved.has(c.id) && !nowResolved.has(c.id) && !siblingResolved.has(c.id))
      return { ...c, status: "active", elimination_week: null };
    return c;
  });
  const coupleUpdates = couples
    .filter(
      (c, i) =>
        c.status !== snapshot.couples[i].status ||
        c.elimination_week !== snapshot.couples[i].elimination_week
    )
    .map(({ id, status, elimination_week }) => ({ id, status, elimination_week }));
  const futureEpisodeIds = !week
    ? []
    : snapshot.episodes
        .filter((e) => {
          if (e.id === episodeId || e.results_published_at) return false;
          if (
            e.week_id &&
            (snapshot.weeks.find((w) => w.id === e.week_id)?.week_number ?? 0) > week.week_number
          )
            return true;
          if (e.week_id === week.id && e.episode_number > episode.episode_number) return true;
          return e.week_id == null && e.episode_number > episode.episode_number;
        })
        .map((e) => e.id);
  if (!week) return { coupleUpdates, futureEpisodeIds, weeklyScores: [] };
  const weekEpisodes = new Set(
    snapshot.episodes.filter((e) => e.week_id === week.id).map((e) => e.id)
  );
  const dances = snapshot.dances
    .filter(
      (d) =>
        weekEpisodes.has(d.episode_id) && (d.episode_id !== episodeId || preserved.has(d.couple_id))
    )
    .map(({ couple_id, total_score, scaled_score }) => ({ couple_id, total_score, scaled_score }));
  for (const d of drafts) {
    if (preserved.has(d.couple_id)) continue;
    const scores = snapshot.draftJudges
      .filter((j) => j.draft_dance_score_id === d.id)
      .map((j) => Number(j.score));
    dances.push({
      couple_id: d.couple_id,
      total_score: scores.reduce((sum, v) => sum + v, 0),
      scaled_score: scaledJudgesScore(scores),
    });
  }
  const jeopardyIds = inJeopardyIdsToPersist(
    snapshot.draftJeopardy.filter((r) => r.episode_id === episodeId).map((r) => r.couple_id),
    entries.map((r) => ({ coupleId: r.couple_id, outcome: r.outcome }))
  );
  const weeklyScores = buildWeeklyScoreRows(
    {
      dances,
      episodes: snapshot.episodes,
      couples,
      outcomes: snapshot.outcomes.filter((r) => weekEpisodes.has(r.episode_id)),
      jeopardy: [
        ...snapshot.jeopardy.filter(
          (r) => weekEpisodes.has(r.episode_id) && r.episode_id !== episodeId
        ),
        ...jeopardyIds.map((couple_id) => ({ couple_id })),
      ],
      leagues: snapshot.leagues,
      settings: snapshot.settings,
      rosters: snapshot.rosters,
      predictions: snapshot.predictions,
      lateUnlocks: snapshot.lateUnlocks,
      grandFinalePredictions: snapshot.grandFinalePredictions,
    },
    week,
    episodeId,
    entries
  );
  return { coupleUpdates, futureEpisodeIds, weeklyScores };
}

export async function publishEpisodeAtomically(
  admin: SupabaseClient<Database>,
  episodeId: string,
  publishedBy: string
): Promise<{ error: string | null }> {
  const { data, error } = await admin.rpc("episode_publication_snapshot", {
    p_episode_id: episodeId,
  });
  if (error) return { error: error.message };
  let plan: PublicationPlan;
  try {
    plan = buildPublicationPlan(data as unknown as PublicationSnapshot, episodeId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not prepare publication" };
  }
  const committed = await admin.rpc("commit_episode_publication", {
    p_episode_id: episodeId,
    p_published_by: publishedBy,
    p_snapshot: data,
    p_plan: plan as unknown as Json,
  });
  return { error: committed.error?.message ?? null };
}
