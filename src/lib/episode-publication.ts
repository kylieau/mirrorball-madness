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
import { eligibleTeamMembers, TEAM_DANCE_JUDGE_COUNT } from "./team-dances";

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
  // Present once supabase/apply-team-dance-entity.sql is applied.
  participants?: Row<"episode_participants">[];
  teams?: Row<"episode_teams">[];
  teamMembers?: Row<"episode_team_members">[];
  teamMarks?: Row<"episode_team_marks">[];
};
export type PublicationPlan = {
  coupleUpdates: Pick<Row<"couples">, "id" | "status" | "elimination_week">[];
  futureEpisodeIds: string[];
  weeklyScores: WeeklyScoreRow[];
};

export type ScoringDance = { episode_id: string; couple_id: string; total_score: number; scaled_score: number };

// A live row that is a team's score for this couple, never a dance the couple
// entered. Older snapshots (before the entity migration) carry no team_id.
export function isTeamRow(row: { team_id?: string | null }): boolean {
  return row.team_id != null;
}

// What each team of the episode pays, from its marks: one row per eligible
// member, exactly as materialize_team_scores() writes it. Throws while a team
// with members has fewer than four marks, so a week can never finish with a
// half-scored team.
export function teamScoreRows(
  snapshot: PublicationSnapshot,
  episodeId: string,
  teamIds?: ReadonlySet<string>
): (ScoringDance & { team_id: string })[] {
  const episode = snapshot.episodes.find((e) => e.id === episodeId);
  const week = snapshot.weeks.find((w) => w.id === episode?.week_id);
  const teams = (snapshot.teams ?? []).filter((t) => t.episode_id === episodeId && (!teamIds || teamIds.has(t.id)));
  const rows: (ScoringDance & { team_id: string })[] = [];
  for (const team of teams) {
    const memberIds = (snapshot.teamMembers ?? []).filter((m) => m.team_id === team.id).map((m) => m.couple_id);
    if (memberIds.length === 0) continue;
    const marks = (snapshot.teamMarks ?? []).filter((m) => m.team_id === team.id).map((m) => Number(m.score));
    if (marks.length !== TEAM_DANCE_JUDGE_COUNT)
      throw new Error(`Team ${team.name} has ${marks.length} of four marks. Score it or remove it before finishing the week.`);
    const { eligible } = eligibleTeamMembers(
      { memberCoupleIds: memberIds },
      memberIds.map((coupleId) => {
        const couple = snapshot.couples.find((c) => c.id === coupleId);
        const outcome = snapshot.draftResults.find((r) => r.episode_id === episodeId && r.couple_id === coupleId)?.outcome ?? null;
        return { coupleId, status: couple?.status ?? "active", eliminationWeek: couple?.elimination_week ?? null, outcome };
      }),
      {
        weekNumber: week?.week_number ?? null,
        participantIds: (snapshot.participants ?? []).filter((p) => p.episode_id === episodeId).map((p) => p.couple_id),
      }
    );
    const total = marks.reduce((sum, v) => sum + v, 0);
    for (const couple_id of eligible) {
      rows.push({ episode_id: episodeId, couple_id, total_score: total, scaled_score: scaledJudgesScore(marks), team_id: team.id });
    }
  }
  return rows;
}

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
  // A couple is posted when their OWN dances are live; a team's row for them
  // is the team's business and never makes them "posted".
  const ownLive = snapshot.dances.filter((d) => d.episode_id === episodeId && !isTeamRow(d));
  const preserved = new Set(episode.results_published_at ? [] : ownLive.map((d) => d.couple_id));
  const unposted = unpostedCoupleIds(
    drafts.map((d) => ({ coupleId: d.couple_id })),
    preserved
  );
  if (unposted.length > 0)
    throw new Error(
      `Post every couple's scores before publishing results (${unposted.length} still to post).`
    );
  // Publication keeps a posted couple's live rows and ignores their draft,
  // which is only safe while the two agree. commit_episode_publication
  // enforces the same rule down to each mark.
  const divergent = [...preserved].filter((coupleId) => {
    const live = ownLive
      .filter((d) => d.couple_id === coupleId)
      .map((d) => `${d.dance_style_id}|${d.song_title ?? ""}|${Number(d.total_score)}`);
    const draft = drafts
      .filter((d) => d.couple_id === coupleId)
      .map((d) => {
        const total = snapshot.draftJudges
          .filter((j) => j.draft_dance_score_id === d.id)
          .reduce((sum, j) => sum + Number(j.score), 0);
        return `${d.dance_style_id}|${d.song_title ?? ""}|${total}`;
      });
    return live.sort().join(";") !== draft.sort().join(";");
  });
  if (divergent.length > 0)
    throw new Error(
      `Posted scores for ${divergent.length} ${divergent.length === 1 ? "couple" : "couples"} differ from their draft (an edit arrived after they were posted). Un-Post and Publish them again before finishing the week.`
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
  // Teams are checked even on an exhibition night, so a half-scored team
  // never slips through just because nothing is scored.
  const teamRows = teamScoreRows(snapshot, episodeId);
  if (!week) return { coupleUpdates, futureEpisodeIds, weeklyScores: [] };
  const weekEpisodes = new Set(
    snapshot.episodes.filter((e) => e.week_id === week.id).map((e) => e.id)
  );
  // Sibling nights as they are; this night from the posted couples' own live
  // rows, the drafts of the rest, and every team rebuilt from its marks.
  const dances: ScoringDance[] = snapshot.dances
    .filter(
      (d) =>
        weekEpisodes.has(d.episode_id) &&
        (d.episode_id !== episodeId || (!isTeamRow(d) && preserved.has(d.couple_id)))
    )
    .map(({ episode_id, couple_id, total_score, scaled_score }) => ({ episode_id, couple_id, total_score, scaled_score }));
  for (const d of drafts) {
    if (preserved.has(d.couple_id)) continue;
    const scores = snapshot.draftJudges
      .filter((j) => j.draft_dance_score_id === d.id)
      .map((j) => Number(j.score));
    dances.push({
      episode_id: episodeId,
      couple_id: d.couple_id,
      total_score: scores.reduce((sum, v) => sum + v, 0),
      scaled_score: scaledJudgesScore(scores),
    });
  }
  dances.push(...teamRows);
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
