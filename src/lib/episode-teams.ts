import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { isValidMark, JUDGE_MARK_MESSAGE } from "./judge-marks";
import {
  DEFAULT_DANCE_TYPE,
  isValidPoints,
  legacyTeamDefaults,
  SPECIAL_DANCE_MAX_JUDGES,
  SPECIAL_DANCE_POINTS_LIMIT,
  type SpecialDance,
  type SpecialDanceDetail,
  type SpecialDanceScore,
  type SpecialDanceSetupInput,
  type SpecialDanceSong,
  type CoupleMarks,
  type TeamMark,
} from "./team-dances";

// "special": supabase/apply-special-dances.sql is applied (episode_teams has
// scoring_mode, dance_scores has max_score). "entity": only
// apply-team-dance-entity.sql is (dance_scores has team_id, the team tables
// and marks exist). "none": neither, so there are no special dances and
// nothing selects team_id. Deploying the code before either SQL therefore
// never 400s a page.
export type TeamsMode = "special" | "entity" | "none";

export type EpisodeTeamsLoad = {
  mode: TeamsMode;
  teamsByEpisode: Record<string, SpecialDance[]>;
  // The saved marks per special dance (draft until posted). Service-role read.
  marksByTeam: Record<string, TeamMark[]>;
  // The saved points and results per Points-mode dance. Service-role read.
  scoresByTeam: Record<string, SpecialDanceScore[]>;
  // Each participant's marks in a couple-by-couple dance. Service-role read.
  coupleMarksByTeam: Record<string, CoupleMarks>;
};

export const EMPTY_TEAMS_LOAD = (mode: TeamsMode): EpisodeTeamsLoad => ({
  mode,
  teamsByEpisode: {},
  marksByTeam: {},
  scoresByTeam: {},
  coupleMarksByTeam: {},
});

// PostgREST reports a missing table as PGRST205 and a missing column as
// 42703 (or PGRST204 on writes); Postgres itself says 42P01 for a table and
// 42883 for a function.
export function isMissingSchemaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (["PGRST205", "PGRST204", "PGRST202", "42P01", "42703", "42883"].includes(error.code ?? "")) return true;
  return (
    /schema cache|does not exist/i.test(error.message ?? "") &&
    /episode_team|team_id|scoring_mode|max_score|special_dance/i.test(error.message ?? "")
  );
}

// One cheap probe: can dance_scores.team_id be selected? Any failure reads as
// "not applied", the safe default.
export async function detectTeamEntity(client: SupabaseClient<Database>): Promise<boolean> {
  const { error } = await client.from("dance_scores").select("team_id").limit(1);
  return !error;
}

// Two cheap probes: can episode_teams.scoring_mode and dance_scores.max_score
// be selected? Both must, or the page reads as entity mode.
export async function detectSpecialDances(client: SupabaseClient<Database>): Promise<boolean> {
  const [teams, dances] = await Promise.all([
    client.from("episode_teams").select("scoring_mode").limit(1),
    client.from("dance_scores").select("max_score").limit(1),
  ]);
  return !teams.error && !dances.error;
}

// All three probes together, so a page pays one round trip for the answer.
export async function detectTeamsMode(client: SupabaseClient<Database>): Promise<TeamsMode> {
  const [entity, special] = await Promise.all([detectTeamEntity(client), detectSpecialDances(client)]);
  if (!entity) return "none";
  return special ? "special" : "entity";
}

// The dance_scores select list for a reader: the base columns, team_id once
// the entity migration is applied (when the reader wants it), and max_score
// once the special-dances migration is. Selecting either earlier would 400
// the page, so every loader builds its list here.
export function danceScoreColumns(mode: TeamsMode, base: string, opts: { teamId?: boolean } = {}): string {
  const extra = [opts.teamId && mode !== "none" ? "team_id" : null, mode === "special" ? "max_score" : null];
  return [base, ...extra.filter((column): column is string => column !== null)].join(", ");
}

// max_score as the engine wants it: null for a legacy row or a reader that
// could not select the column, a number otherwise (0 for a Points row).
export function danceMaxScore(row: { max_score?: number | string | null }): number | null {
  return row.max_score == null ? null : Number(row.max_score);
}

const BASE_TEAM_COLUMNS = "id, episode_id, name, song_title, dance_style_id, captain_couple_id, host_name, sort_order, posted_at";
const SPECIAL_TEAM_COLUMNS =
  ", dance_type, scoring_mode, second_dance_style_id, songs, details, name_is_auto, updated_at, round_id, heat_number";

type TeamRow = {
  id: string;
  episode_id: string;
  name: string;
  song_title: string | null;
  dance_style_id: string;
  captain_couple_id: string | null;
  host_name: string | null;
  sort_order: number;
  posted_at: string | null;
  dance_type?: string;
  scoring_mode?: string;
  second_dance_style_id?: string | null;
  songs?: Json;
  details?: Json;
  name_is_auto?: boolean;
  updated_at?: string;
  round_id?: string | null;
  heat_number?: number | null;
};

function parseSongs(value: Json | undefined): SpecialDanceSong[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((song) => {
    if (!song || typeof song !== "object" || Array.isArray(song)) return [];
    const title = typeof song.title === "string" ? song.title : "";
    return title.trim() ? [{ title }] : [];
  });
}

function parseDetails(value: Json | undefined): SpecialDanceDetail[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((detail) => {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
    const label = typeof detail.label === "string" ? detail.label : "";
    if (!label.trim()) return [];
    return [
      {
        label,
        value: typeof detail.value === "string" ? detail.value : "",
        coupleId: typeof detail.coupleId === "string" && detail.coupleId ? detail.coupleId : null,
      },
    ];
  });
}

export function specialDanceFromRow(row: TeamRow, memberCoupleIds: string[], captainName?: string | null): SpecialDance {
  const legacy = legacyTeamDefaults({ songTitle: row.song_title, captainCoupleId: row.captain_couple_id, hostName: row.host_name, captainName });
  return {
    id: row.id,
    episodeId: row.episode_id,
    name: row.name,
    nameIsAuto: row.name_is_auto ?? legacy.nameIsAuto,
    danceType: row.dance_type?.trim() || legacy.danceType,
    scoringMode: row.scoring_mode === "points" || row.scoring_mode === "couple_marks" ? row.scoring_mode : "marks",
    danceStyleId: row.dance_style_id,
    secondDanceStyleId: row.second_dance_style_id ?? null,
    songs: parseSongs(row.songs) ?? legacy.songs,
    songTitle: row.song_title,
    details: parseDetails(row.details) ?? legacy.details,
    captainCoupleId: row.captain_couple_id,
    hostName: row.host_name,
    sortOrder: row.sort_order,
    memberCoupleIds,
    roundId: row.round_id ?? null,
    heatNumber: row.heat_number ?? null,
    postedAt: row.posted_at,
    updatedAt: row.updated_at ?? null,
  };
}

// Callers probe with detectTeamsMode first; a missing-schema error here
// still degrades to no special dances instead of failing the page. In entity
// mode only the original columns are selected and every dance reads as a
// Team Dance scored by marks out of 10 on the night's panel.
export async function loadEpisodeTeams(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  episodeIds: string[],
  mode: Exclude<TeamsMode, "none"> = "entity"
): Promise<EpisodeTeamsLoad> {
  if (episodeIds.length === 0) return EMPTY_TEAMS_LOAD(mode);
  const [teams, members] = await Promise.all([
    client
      .from("episode_teams")
      .select(`${BASE_TEAM_COLUMNS}${mode === "special" ? SPECIAL_TEAM_COLUMNS : ""}`)
      .in("episode_id", episodeIds)
      .order("sort_order")
      .order("created_at"),
    client
      .from("episode_team_members")
      .select(`team_id, couple_id${mode === "special" ? ", sort_order" : ""}`)
      .in("episode_id", episodeIds),
  ]);
  const failed = teams.error ?? members.error;
  if (failed) {
    if (isMissingSchemaError(failed)) return EMPTY_TEAMS_LOAD("none");
    throw new Error("Could not load the episode teams. Please try again.");
  }
  const teamRows = (teams.data ?? []) as unknown as TeamRow[];
  const teamIds = teamRows.map((t) => t.id);
  const [marks, scores, coupleMarks] =
    teamIds.length > 0
      ? await Promise.all([
          admin.from("episode_team_marks").select("team_id, judge_id, score").in("team_id", teamIds),
          mode === "special"
            ? admin.from("episode_team_scores").select("team_id, couple_id, points, result").in("team_id", teamIds)
            : Promise.resolve({ data: [], error: null }),
          mode === "special"
            ? admin.from("episode_team_couple_marks").select("team_id, couple_id, judge_id, score").in("team_id", teamIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (marks.error || coupleMarks.error) throw new Error("Could not load the team marks. Please try again.");
  if (scores.error) throw new Error("Could not load the special dance points. Please try again.");
  const memberRows = (members.data ?? []) as unknown as { team_id: string; couple_id: string; sort_order?: number }[];
  const membersByTeam = new Map<string, { coupleId: string; sortOrder: number }[]>();
  for (const row of memberRows) {
    (membersByTeam.get(row.team_id) ?? membersByTeam.set(row.team_id, []).get(row.team_id)!).push({
      coupleId: row.couple_id,
      sortOrder: row.sort_order ?? 0,
    });
  }
  const marksByTeam: Record<string, TeamMark[]> = {};
  for (const row of marks.data ?? []) {
    (marksByTeam[row.team_id] ??= []).push({ judgeId: row.judge_id, score: Number(row.score) });
  }
  const scoresByTeam: Record<string, SpecialDanceScore[]> = {};
  for (const row of scores.data ?? []) {
    (scoresByTeam[row.team_id] ??= []).push({
      coupleId: row.couple_id,
      points: row.points == null ? null : Number(row.points),
      result: row.result ?? null,
    });
  }
  const coupleMarksByTeam: Record<string, CoupleMarks> = {};
  for (const row of coupleMarks.data ?? []) {
    ((coupleMarksByTeam[row.team_id] ??= {})[row.couple_id] ??= []).push({ judgeId: row.judge_id, score: Number(row.score) });
  }
  const teamsByEpisode: Record<string, SpecialDance[]> = {};
  for (const row of teamRows) {
    const memberIds = (membersByTeam.get(row.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.coupleId.localeCompare(b.coupleId))
      .map((m) => m.coupleId);
    (teamsByEpisode[row.episode_id] ??= []).push(specialDanceFromRow(row, memberIds));
  }
  return { mode, teamsByEpisode, marksByTeam, scoresByTeam, coupleMarksByTeam };
}

export type SpecialDanceLabel = { name: string; danceType: string; scoringMode: "marks" | "points" };

// Names and types for fan labels: authenticated viewers read every special
// dance, guests only those of published episodes (RLS). Empty when the
// migration is not applied; in entity mode every entry reads as a Team Dance.
export async function loadSpecialDanceLabels(
  client: SupabaseClient<Database>,
  episodeIds: string[],
  mode: TeamsMode
): Promise<Record<string, SpecialDanceLabel>> {
  if (episodeIds.length === 0 || mode === "none") return {};
  const { data, error } = await client
    .from("episode_teams")
    .select(`id, name${mode === "special" ? ", dance_type, scoring_mode" : ""}`)
    .in("episode_id", episodeIds);
  if (error) return {};
  return Object.fromEntries(
    ((data ?? []) as unknown as { id: string; name: string; dance_type?: string; scoring_mode?: string }[]).map((t) => [
      t.id,
      { name: t.name, danceType: t.dance_type?.trim() || DEFAULT_DANCE_TYPE, scoringMode: t.scoring_mode === "points" ? "points" : "marks" },
    ])
  );
}

export const TEAM_TABLES_MISSING_MESSAGE =
  "Team Dances need the database update (supabase/apply-team-dance-entity.sql) before teams can be saved.";
export const SPECIAL_DANCES_MISSING_MESSAGE =
  "Special Dances need the database update (supabase/apply-special-dances.sql) before this can be saved.";
export const SPECIAL_DRAFT_RELEASE_MISSING_MESSAGE =
  "Releasing a special dance as a draft needs the database update (supabase/apply-special-draft-release.sql).";

function translateError(error: { code?: string | null; message: string }, missingMessage: string): string {
  return isMissingSchemaError(error) ? missingMessage : error.message;
}

// Admin. Upserts one special dance's setup (the inline editor's Done).
export async function saveSpecialDance(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; dance: SpecialDanceSetupInput },
  actorId: string
): Promise<{ error: string | null; result?: { id: string } }> {
  const { data, error } = await admin.rpc("save_special_dance", {
    p_episode_id: input.episodeId,
    p_actor_id: actorId,
    p_dance: input.dance as unknown as Json,
  });
  if (error) return { error: translateError(error, SPECIAL_DANCES_MISSING_MESSAGE) };
  return { error: null, result: { id: data as string } };
}

// Admin. Removes a special dance that is not posted.
export async function deleteSpecialDance(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string },
  actorId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("delete_special_dance", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
  });
  if (error) return { error: translateError(error, SPECIAL_DANCES_MISSING_MESSAGE) };
  return { error: null };
}

// Propose tier. Partial sets are allowed (a mark at a time); posting needs a
// mark from every judge on the dance's panel.
export async function saveTeamMarks(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; marks: TeamMark[] },
  actorId: string
): Promise<{ error: string | null }> {
  if (input.marks.length > SPECIAL_DANCE_MAX_JUDGES) return { error: `Marks must be a list of at most ${SPECIAL_DANCE_MAX_JUDGES}.` };
  if (input.marks.some((m) => !isValidMark(m.score))) return { error: JUDGE_MARK_MESSAGE };
  const { error } = await admin.rpc("save_team_marks", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
    p_marks: input.marks as unknown as Json,
  });
  if (error) return { error: translateError(error, TEAM_TABLES_MISSING_MESSAGE) };
  return { error: null };
}

// Propose tier. One participant's marks in a couple-by-couple dance; partial
// sets save, and posting needs every eligible participant's full set.
export async function saveTeamCoupleMarks(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; coupleId: string; marks: TeamMark[] },
  actorId: string
): Promise<{ error: string | null }> {
  if (input.marks.length > SPECIAL_DANCE_MAX_JUDGES) return { error: `Marks must be a list of at most ${SPECIAL_DANCE_MAX_JUDGES}.` };
  if (input.marks.some((m) => !isValidMark(m.score))) return { error: JUDGE_MARK_MESSAGE };
  const { error } = await admin.rpc("save_team_couple_marks", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
    p_couple_id: input.coupleId,
    p_marks: input.marks as unknown as Json,
  });
  return { error: error?.message ?? null };
}

// Propose tier, like a couple's draft release: fans who unlocked the week's
// drafts see a fully scored, unposted special dance before it is posted.
export async function setSpecialDraftRelease(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; release: boolean },
  actorId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("set_special_draft_release", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
    p_release: input.release,
  });
  return { error: error ? translateError(error, SPECIAL_DRAFT_RELEASE_MISSING_MESSAGE) : null };
}

// Propose tier. Each participant's points and result in a Points-mode dance;
// a blank box is sent as null and keeps the dance from posting.
export async function saveSpecialDancePoints(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; scores: SpecialDanceScore[] },
  actorId: string
): Promise<{ error: string | null }> {
  if (input.scores.some((s) => s.points !== null && !isValidPoints(s.points)))
    return { error: `Points must be between -${SPECIAL_DANCE_POINTS_LIMIT} and ${SPECIAL_DANCE_POINTS_LIMIT} in steps of 0.5.` };
  const { error } = await admin.rpc("save_special_dance_points", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
    p_scores: input.scores as unknown as Json,
  });
  if (error) return { error: translateError(error, SPECIAL_DANCES_MISSING_MESSAGE) };
  return { error: null };
}
