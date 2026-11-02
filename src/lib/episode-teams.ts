import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { EpisodeTeam, TeamMark, TeamSetupInput } from "./team-dances";

// "entity": supabase/apply-team-dance-entity.sql is applied (dance_scores has
// team_id, the team tables and marks exist). "inferred": not yet, so teams are
// read off the couples' slot-2 rows and nothing selects team_id. Deploying
// the code before the SQL therefore never 400s a page.
export type TeamsMode = "entity" | "inferred";

export type EpisodeTeamsLoad = {
  mode: TeamsMode;
  teamsByEpisode: Record<string, EpisodeTeam[]>;
  // The saved marks per team (draft until posted). Service-role read.
  marksByTeam: Record<string, TeamMark[]>;
};

// PostgREST reports a missing table as PGRST205 and a missing column as
// 42703 (or PGRST204 on writes); Postgres itself says 42P01 for a table.
export function isMissingSchemaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (["PGRST205", "PGRST204", "42P01", "42703"].includes(error.code ?? "")) return true;
  return /schema cache|does not exist/i.test(error.message ?? "") && /episode_team|team_id/i.test(error.message ?? "");
}

// One cheap probe: can dance_scores.team_id be selected? Any failure reads as
// "not applied", the safe default.
export async function detectTeamEntity(client: SupabaseClient<Database>): Promise<boolean> {
  const { error } = await client.from("dance_scores").select("team_id").limit(1);
  return !error;
}

// Callers probe with detectTeamEntity first; a missing-schema error here
// still degrades to the inferred mode instead of failing the page.
export async function loadEpisodeTeams(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  episodeIds: string[]
): Promise<EpisodeTeamsLoad> {
  if (episodeIds.length === 0) return { mode: "entity", teamsByEpisode: {}, marksByTeam: {} };
  const [teams, members] = await Promise.all([
    client
      .from("episode_teams")
      .select("id, episode_id, name, song_title, song_source, dance_style_id, captain_couple_id, host_name, sort_order, posted_at")
      .in("episode_id", episodeIds)
      .order("sort_order")
      .order("created_at"),
    client.from("episode_team_members").select("team_id, couple_id").in("episode_id", episodeIds),
  ]);
  const failed = teams.error ?? members.error;
  if (failed) {
    if (isMissingSchemaError(failed)) return { mode: "inferred", teamsByEpisode: {}, marksByTeam: {} };
    throw new Error("Could not load the episode teams. Please try again.");
  }
  const teamIds = (teams.data ?? []).map((t) => t.id);
  const marks = teamIds.length > 0 ? await admin.from("episode_team_marks").select("team_id, judge_id, score").in("team_id", teamIds) : { data: [], error: null };
  if (marks.error) throw new Error("Could not load the team marks. Please try again.");
  const membersByTeam = new Map<string, string[]>();
  for (const row of members.data ?? []) {
    (membersByTeam.get(row.team_id) ?? membersByTeam.set(row.team_id, []).get(row.team_id)!).push(row.couple_id);
  }
  const marksByTeam: Record<string, TeamMark[]> = {};
  for (const row of marks.data ?? []) {
    (marksByTeam[row.team_id] ??= []).push({ judgeId: row.judge_id, score: Number(row.score) });
  }
  const teamsByEpisode: Record<string, EpisodeTeam[]> = {};
  for (const row of teams.data ?? []) {
    (teamsByEpisode[row.episode_id] ??= []).push({
      id: row.id,
      episodeId: row.episode_id,
      name: row.name,
      songTitle: row.song_title,
      songSource: row.song_source,
      danceStyleId: row.dance_style_id,
      captainCoupleId: row.captain_couple_id,
      hostName: row.host_name,
      sortOrder: row.sort_order,
      memberCoupleIds: (membersByTeam.get(row.id) ?? []).sort(),
      inferred: false,
      postedAt: row.posted_at,
    });
  }
  return { mode: "entity", teamsByEpisode, marksByTeam };
}

// Team names for fan labels: authenticated viewers read every team, guests
// only those of published episodes (RLS). Empty when the migration is not
// applied, when the heuristic label stands in.
export async function loadTeamNames(client: SupabaseClient<Database>, episodeIds: string[]): Promise<Record<string, string>> {
  if (episodeIds.length === 0) return {};
  const { data, error } = await client.from("episode_teams").select("id, name").in("episode_id", episodeIds);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((t) => [t.id, t.name]));
}

export const TEAM_TABLES_MISSING_MESSAGE =
  "Team Dances need the database update (supabase/apply-team-dance-entity.sql) before teams can be saved.";

export type SaveTeamsResult = { teamIds: string[] };

export async function saveEpisodeTeams(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teams: TeamSetupInput[] },
  actorId: string
): Promise<{ error: string | null; result?: SaveTeamsResult }> {
  const { data, error } = await admin.rpc("save_episode_teams", {
    p_episode_id: input.episodeId,
    p_actor_id: actorId,
    p_teams: input.teams as unknown as Json,
  });
  if (error) return { error: isMissingSchemaError(error) ? TEAM_TABLES_MISSING_MESSAGE : error.message };
  return { error: null, result: data as unknown as SaveTeamsResult };
}

// Partial sets are allowed (a mark at a time); posting needs all four.
export async function saveTeamMarks(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; marks: TeamMark[] },
  actorId: string
): Promise<{ error: string | null }> {
  if (input.marks.some((m) => !Number.isFinite(m.score) || m.score < 0 || m.score > 10))
    return { error: "Judge scores must be between 0 and 10." };
  const { error } = await admin.rpc("save_team_marks", {
    p_episode_id: input.episodeId,
    p_team_id: input.teamId,
    p_actor_id: actorId,
    p_marks: input.marks as unknown as Json,
  });
  if (error) return { error: isMissingSchemaError(error) ? TEAM_TABLES_MISSING_MESSAGE : error.message };
  return { error: null };
}
