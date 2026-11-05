import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EpisodeRound, ExceptionKind, RoundException, RoundKind, RoundScoring } from "./episode-rounds";

export type EpisodeRoundsLoad = {
  roundsByEpisode: Record<string, EpisodeRound[]>;
  exceptionsByEpisode: Record<string, RoundException[]>;
};

// The plans and their exceptions. Exceptions carry notes for the people
// entering results and no client role can read them, so they come through
// the service-role client.
export async function loadEpisodeRounds(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  episodeIds: string[]
): Promise<EpisodeRoundsLoad> {
  if (episodeIds.length === 0) return { roundsByEpisode: {}, exceptionsByEpisode: {} };
  const [rounds, exceptions] = await Promise.all([
    client
      .from("episode_rounds")
      .select("id, episode_id, position, kind, round_type, scoring, bonus_points, unit_count")
      .in("episode_id", episodeIds)
      .order("position"),
    admin
      .from("episode_round_exceptions")
      .select("round_id, episode_id, couple_id, kind, note, bonus_points")
      .in("episode_id", episodeIds)
      .order("created_at"),
  ]);
  if (rounds.error || exceptions.error) throw new Error("Could not load the episode's rounds. Please try again.");
  const roundsByEpisode: Record<string, EpisodeRound[]> = {};
  for (const row of rounds.data ?? []) {
    (roundsByEpisode[row.episode_id] ??= []).push({
      id: row.id,
      episodeId: row.episode_id,
      position: row.position,
      kind: row.kind as RoundKind,
      roundType: row.round_type,
      scoring: row.scoring as RoundScoring,
      bonusPoints: row.bonus_points == null ? null : Number(row.bonus_points),
      unitCount: row.unit_count,
    });
  }
  const exceptionsByEpisode: Record<string, RoundException[]> = {};
  for (const row of exceptions.data ?? []) {
    (exceptionsByEpisode[row.episode_id] ??= []).push({
      roundId: row.round_id,
      coupleId: row.couple_id,
      kind: row.kind as ExceptionKind,
      note: row.note,
      bonusPoints: row.bonus_points == null ? null : Number(row.bonus_points),
    });
  }
  return { roundsByEpisode, exceptionsByEpisode };
}

// Propose tier. Marks (kind set) or clears (kind null) one couple in some
// rounds; the RPC also moves their draft outcome and Immunity box.
export async function saveRoundException(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; coupleId: string; roundIds: string[]; kind: ExceptionKind | null; note: string | null; bonusPoints: number | null },
  actorId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("save_round_exception", {
    p_episode_id: input.episodeId,
    p_actor_id: actorId,
    p_couple_id: input.coupleId,
    p_round_ids: input.roundIds,
    p_kind: input.kind as string,
    p_note: input.note as string,
    p_bonus: input.bonusPoints as number,
  });
  return { error: error?.message ?? null };
}

// Propose tier: a winner's bonus is often only announced on air.
export async function setRoundBonus(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; roundId: string; bonusPoints: number | null },
  actorId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("set_round_bonus", {
    p_episode_id: input.episodeId,
    p_actor_id: actorId,
    p_round_id: input.roundId,
    p_bonus: input.bonusPoints as number,
  });
  return { error: error?.message ?? null };
}
