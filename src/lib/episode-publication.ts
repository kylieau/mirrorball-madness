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
import { eligibleTeamMembers, isValidPanelSize, SPECIAL_DANCE_MAX_JUDGES, SPECIAL_DANCE_MIN_JUDGES } from "./team-dances";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
// The team columns every snapshot has carried since the entity migration;
// the special-dance columns arrive with apply-special-dances.sql and read as
// a Team Dance scored by marks out of 10 on the night's panel until then.
type SnapshotTeam = Pick<Row<"episode_teams">, "id" | "episode_id" | "name" | "dance_style_id" | "song_title" | "posted_at"> &
  Partial<Pick<Row<"episode_teams">, "dance_type" | "scoring_mode" | "mark_max" | "panel_judge_ids">>;
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
  teams?: SnapshotTeam[];
  teamMembers?: Pick<Row<"episode_team_members">, "team_id" | "couple_id">[];
  teamMarks?: Pick<Row<"episode_team_marks">, "team_id" | "judge_id" | "score">[];
  // Present once supabase/apply-special-dances.sql is applied: the Points
  // rows, the standing panel, and this night's guests, so a special dance's
  // completeness is judged against the same panel the SQL uses.
  teamScores?: Pick<Row<"episode_team_scores">, "team_id" | "couple_id" | "points" | "result">[];
  judges?: { id: string }[];
  guestJudges?: Pick<Row<"episode_guest_judges">, "episode_id" | "judge_id">[];
};
// Plans carry planVersion 2 once readers know max_score; the SQL refuses an
// unversioned plan for an episode with a Points-mode special dance, because
// older code would pay its rows as if they had no marks.
export const PLAN_VERSION = 2;
export type PublicationPlan = {
  planVersion: number;
  coupleUpdates: Pick<Row<"couples">, "id" | "status" | "elimination_week">[];
  futureEpisodeIds: string[];
  weeklyScores: WeeklyScoreRow[];
};

export type ScoringDance = {
  episode_id: string;
  couple_id: string;
  total_score: number;
  scaled_score: number;
  max_score: number | null;
};

// A live row that is a team's score for this couple, never a dance the couple
// entered. Older snapshots (before the entity migration) carry no team_id.
export function isTeamRow(row: { team_id?: string | null }): boolean {
  return row.team_id != null;
}

// Before apply-special-dances.sql the snapshot carries no panel, and the SQL
// of that era (materialize_team_scores) takes exactly four marks per team;
// a plan built from such a snapshot mirrors that rule so the admin reads the
// same message the commit would raise.
const LEGACY_TEAM_PANEL_SIZE = 4;

// The judges whose marks a special dance takes: its own panel when one was
// chosen, else the standing panel plus this night's guests. Mirrors
// special_dance_panel(). Null for a snapshot taken before the migration.
function specialDancePanelIds(snapshot: PublicationSnapshot, episodeId: string, team: SnapshotTeam): string[] | null {
  if (team.panel_judge_ids) return team.panel_judge_ids;
  if (!snapshot.judges || !snapshot.guestJudges) return null;
  const panel = new Set(snapshot.judges.map((j) => j.id));
  for (const guest of snapshot.guestJudges) if (guest.episode_id === episodeId) panel.add(guest.judge_id);
  return [...panel];
}

// What each special dance of the episode pays: one row per eligible member,
// exactly as materialize_team_scores() writes it. A Marks dance pays its
// total over panel × per-judge max; a Points dance pays its points as a
// 0-max row. Throws while a dance with members is incomplete (a judge on its
// panel without a mark, a participant without points), so a week can never
// finish with a half-scored special dance.
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
    const label = (team.dance_type?.trim() || "Team Dance") === "Team Dance" ? `Team ${team.name}` : team.name;
    if (team.scoring_mode === "points") {
      const scores = (snapshot.teamScores ?? []).filter((s) => s.team_id === team.id && s.points != null);
      const missing = eligible.filter((coupleId) => !scores.some((s) => s.couple_id === coupleId));
      if (missing.length > 0)
        throw new Error(
          `${label} has points for ${eligible.length - missing.length} of ${eligible.length} couples. Enter every couple's points or remove it before finishing the week.`
        );
      for (const couple_id of eligible) {
        const points = Number(scores.find((s) => s.couple_id === couple_id)!.points);
        rows.push({ episode_id: episodeId, couple_id, total_score: points, scaled_score: 0, max_score: 0, team_id: team.id });
      }
      continue;
    }
    const marks = (snapshot.teamMarks ?? []).filter((m) => m.team_id === team.id);
    const panel = specialDancePanelIds(snapshot, episodeId, team);
    if (panel === null && marks.length !== LEGACY_TEAM_PANEL_SIZE)
      throw new Error(`${label} has ${marks.length} of four marks. Score it or remove it before finishing the week.`);
    const marked = panel ? panel.filter((judgeId) => marks.some((m) => m.judge_id === judgeId)) : marks.map((m) => m.judge_id);
    if (panel && !isValidPanelSize(panel.length))
      throw new Error(
        `${label} needs ${SPECIAL_DANCE_MIN_JUDGES} to ${SPECIAL_DANCE_MAX_JUDGES} judges and has ${panel.length}. Fix its panel before finishing the week.`
      );
    if (panel && marked.length !== panel.length)
      throw new Error(`${label} has ${marked.length} of ${panel.length} marks. Score it or remove it before finishing the week.`);
    const markMax = team.mark_max == null ? 10 : Number(team.mark_max);
    const scores = marked.map((judgeId) => Number(marks.find((m) => m.judge_id === judgeId)!.score));
    const total = scores.reduce((sum, v) => sum + v, 0);
    const max_score = marked.length * markMax;
    for (const couple_id of eligible) {
      rows.push({ episode_id: episodeId, couple_id, total_score: total, scaled_score: scaledJudgesScore(scores, markMax), max_score, team_id: team.id });
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
  if (!week) return { planVersion: PLAN_VERSION, coupleUpdates, futureEpisodeIds, weeklyScores: [] };
  const weekEpisodes = new Set(
    snapshot.episodes.filter((e) => e.week_id === week.id).map((e) => e.id)
  );
  // Sibling nights as they are; this night from the posted couples' own live
  // rows, the drafts of the rest, and every special dance rebuilt from its
  // marks or points.
  const dances: ScoringDance[] = snapshot.dances
    .filter(
      (d) =>
        weekEpisodes.has(d.episode_id) &&
        (d.episode_id !== episodeId || (!isTeamRow(d) && preserved.has(d.couple_id)))
    )
    .map(scoringDance);
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
      max_score: null,
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
  return { planVersion: PLAN_VERSION, coupleUpdates, futureEpisodeIds, weeklyScores };
}

// A live row as the engine scores it. Snapshots taken before
// apply-special-dances.sql carry no max_score, which reads as a legacy row.
export function scoringDance(row: {
  episode_id: string;
  couple_id: string;
  total_score: number | string;
  scaled_score: number | string;
  max_score?: number | string | null;
}): ScoringDance {
  return {
    episode_id: row.episode_id,
    couple_id: row.couple_id,
    total_score: Number(row.total_score),
    scaled_score: Number(row.scaled_score),
    max_score: row.max_score == null ? null : Number(row.max_score),
  };
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
