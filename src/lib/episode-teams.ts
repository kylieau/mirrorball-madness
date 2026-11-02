import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { EpisodeTeam, TeamMark, TeamSetupInput } from "./team-dances";
import { revealCouple, undoReveal } from "./results-reveal";

export type EpisodeTeamsLoad = {
  // False until supabase/apply-team-dances.sql has been applied: the tables
  // are not there yet, so Enter Results hides the Team Dances card instead of
  // erroring.
  available: boolean;
  teamsByEpisode: Record<string, EpisodeTeam[]>;
};

// PostgREST reports a table missing from its schema cache as PGRST205;
// Postgres itself reports an undefined table as 42P01.
export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /schema cache|does not exist/i.test(error.message ?? "") && /episode_team/i.test(error.message ?? "");
}

export async function loadEpisodeTeams(
  client: SupabaseClient<Database>,
  episodeIds: string[]
): Promise<EpisodeTeamsLoad> {
  if (episodeIds.length === 0) return { available: true, teamsByEpisode: {} };
  const [teams, members] = await Promise.all([
    client
      .from("episode_teams")
      .select("id, episode_id, name, song_title, song_source, dance_style_id, captain_couple_id, host_name, sort_order")
      .in("episode_id", episodeIds)
      .order("sort_order")
      .order("created_at"),
    client.from("episode_team_members").select("team_id, couple_id").in("episode_id", episodeIds),
  ]);
  const failed = teams.error ?? members.error;
  if (failed) {
    if (isMissingTableError(failed)) return { available: false, teamsByEpisode: {} };
    throw new Error("Could not load the episode teams. Please try again.");
  }
  const membersByTeam = new Map<string, string[]>();
  for (const row of members.data ?? []) {
    (membersByTeam.get(row.team_id) ?? membersByTeam.set(row.team_id, []).get(row.team_id)!).push(row.couple_id);
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
    });
  }
  return { available: true, teamsByEpisode };
}

export type SaveTeamsResult = {
  teamIds: string[];
  posted: string[];
  collisions: { coupleId: string; teamRows: number; otherDances: number }[];
};

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
  if (error) return { error: isMissingTableError(error) ? TEAM_TABLES_MISSING_MESSAGE : error.message };
  return { error: null, result: data as unknown as SaveTeamsResult };
}

export const TEAM_TABLES_MISSING_MESSAGE =
  "Team Dances need the database update (supabase/apply-team-dances.sql) before teams can be saved.";

export type ApplyTeamDanceResult = {
  applied: string[];
  posted: string[];
  skipped: { coupleId: string; reason: "withdrawn" | "bye" | "eliminated" | "not_performing" }[];
  collisions: { coupleId: string; teamRows: number; otherDances: number }[];
};

export type ApplyTeamDanceInput = {
  episodeId: string;
  teamId: string;
  marks: TeamMark[];
  coupleIds?: string[];
};

export async function applyTeamDance(
  admin: SupabaseClient<Database>,
  input: ApplyTeamDanceInput,
  actorId: string
): Promise<{ error: string | null; result?: ApplyTeamDanceResult }> {
  if (input.marks.some((m) => !Number.isFinite(m.score) || m.score < 0 || m.score > 10))
    return { error: "Judge scores must be between 0 and 10." };
  const { data, error } = await admin.rpc("apply_team_dance", {
    p_episode_id: input.episodeId,
    p_actor_id: actorId,
    p_team_id: input.teamId,
    p_marks: input.marks as unknown as Json,
    ...(input.coupleIds ? { p_couple_ids: input.coupleIds } : {}),
  });
  if (error) return { error: isMissingTableError(error) ? TEAM_TABLES_MISSING_MESSAGE : error.message };
  return { error: null, result: data as unknown as ApplyTeamDanceResult };
}

// A member posted before the team was scored keeps stale live rows until they
// are un-posted and posted again. Each step is its own atomic RPC; if the
// re-post fails the couple is left visibly unposted with the team dance in
// their draft, never silently short.
export async function overridePostedTeamMember(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; teamId: string; coupleId: string; marks: TeamMark[] },
  actorId: string
): Promise<{ error: string | null }> {
  const undone = await undoReveal(admin, { episodeId: input.episodeId, coupleId: input.coupleId }, actorId);
  if (undone.error) return { error: `Could not un-post this couple: ${undone.error}` };
  const applied = await applyTeamDance(
    admin,
    { episodeId: input.episodeId, teamId: input.teamId, marks: input.marks, coupleIds: [input.coupleId] },
    actorId
  );
  if (applied.error) return { error: `Un-posted, but the team score could not be applied: ${applied.error}` };
  if (applied.result?.collisions.length)
    return { error: "Un-posted, but this couple's draft has more than one other dance. Fix their dances, then Publish them again." };
  if (applied.result?.skipped.length)
    return { error: "Un-posted, but this couple is not eligible for the team dance. Check their status, then Publish them again." };
  const reposted = await revealCouple(admin, { episodeId: input.episodeId, coupleId: input.coupleId }, actorId);
  if (reposted.error) return { error: `Team score added, but this couple could not be posted again: ${reposted.error}` };
  return { error: null };
}
