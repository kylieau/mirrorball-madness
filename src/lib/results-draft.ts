import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Outcome } from "./scoring";
import type { Json } from "./supabase/types";

export type DraftJudgeScoreInput = { judgeId: string; score: number };

export type DraftDanceInput = {
  danceStyleId: string;
  songTitle: string | null;
  judgeScores: DraftJudgeScoreInput[];
};

export type DraftEntryInput = {
  coupleId: string;
  dances: DraftDanceInput[];
  outcome: Outcome;
  savedByJudges: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

export type SaveDraftResultsInput = {
  episodeId: string;
  guestJudgeName: string | null;
  judgesSaveAvailable: boolean;
  entries: DraftEntryInput[];
  inJeopardyCoupleIds: string[];
  updatedBy: string;
  correctionToken?: string | null;
};

export type DraftDanceState = {
  id: string;
  coupleId: string;
  danceStyleId: string;
  songTitle: string | null;
  judgeScores: DraftJudgeScoreInput[];
};

export type DraftEntryState = {
  coupleId: string;
  outcome: Outcome;
  savedByJudges: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

export type DraftCustomMoment = { id: string; coupleId: string | null; label: string };

export type DraftState = {
  correctionToken?: string | null;
  hasDraft: boolean;
  guestJudgeName: string | null;
  judgesSaveAvailable: boolean;
  updatedAt: string | null;
  dances: DraftDanceState[];
  entries: DraftEntryState[];
  customMoments: DraftCustomMoment[];
  inJeopardyCoupleIds: string[];
};

const EMPTY_DRAFT_STATE: DraftState = {
  hasDraft: false,
  guestJudgeName: null,
  judgesSaveAvailable: false,
  updatedAt: null,
  dances: [],
  entries: [],
  customMoments: [],
  inJeopardyCoupleIds: [],
};

// The database locks the episode and replaces only edited couples in one transaction.
export async function saveDraftResults(
  admin: SupabaseClient<Database>, input: SaveDraftResultsInput
): Promise<{ error: string | null }> {
  if (input.entries.some((entry) => entry.dances.some((dance) => dance.judgeScores.some(
    ({ score }) => !Number.isFinite(score) || score < 0 || score > 10
  )))) return { error: "Judge scores must be between 0 and 10." };
  const { error } = await admin.rpc("save_episode_draft", { p_input: input as unknown as Json });
  return { error: error?.message ?? null };
}

export async function loadDraftForEpisode(
  admin: SupabaseClient<Database>,
  episodeId: string
): Promise<DraftState> {
  const reads =
    await Promise.all([
      admin.from("draft_episode_overrides").select("*").eq("episode_id", episodeId).maybeSingle(),
      admin
        .from("draft_dance_scores")
        .select("id, couple_id, dance_style_id, song_title, draft_judge_scores(judge_id, score)")
        .eq("episode_id", episodeId),
      admin.from("draft_episode_results").select("*").eq("episode_id", episodeId),
      admin.from("draft_episode_custom_moments").select("id, couple_id, label").eq("episode_id", episodeId),
      admin.from("draft_episode_in_jeopardy_couples").select("couple_id").eq("episode_id", episodeId),
    ]);

  const failed = reads.find((result) => result.error);
  if (failed?.error) throw new Error("Could not load the complete episode draft. Please try again.");
  const [{ data: override }, { data: draftDances }, { data: draftResults }, { data: customMoments }, { data: jeopardy }] = reads;
  if (!override) return EMPTY_DRAFT_STATE;

  return {
    hasDraft: true,
    correctionToken: override.correction_token,
    guestJudgeName: override.guest_judge_name,
    judgesSaveAvailable: override.judges_save_available,
    updatedAt: override.updated_at,
    dances: (draftDances ?? []).map((d) => ({
      id: d.id,
      coupleId: d.couple_id,
      danceStyleId: d.dance_style_id,
      songTitle: d.song_title,
      judgeScores: (d.draft_judge_scores ?? []).map((js) => ({ judgeId: js.judge_id, score: js.score })),
    })),
    entries: (draftResults ?? []).map((r) => ({
      coupleId: r.couple_id,
      outcome: r.outcome as Outcome,
      savedByJudges: r.saved_by_judges,
      hadImmunity: r.had_immunity,
      bonusPoints: r.bonus_points,
      bonusNote: r.bonus_note,
    })),
    customMoments: (customMoments ?? []).map((m) => ({ id: m.id, coupleId: m.couple_id, label: m.label })),
    inJeopardyCoupleIds: (jeopardy ?? []).map((row) => row.couple_id),
  };
}

export async function addDraftCustomMoment(admin: SupabaseClient<Database>, input: { episodeId: string; coupleId: string | null; label: string; createdBy: string }): Promise<{ error: string | null; id?: string }> {
  const { data, error } = await admin.rpc("mutate_draft_moment", { p_episode_id: input.episodeId, p_actor_id: input.createdBy, p_moment_id: null, p_couple_id: input.coupleId, p_label: input.label, p_remove: false });
  return { error: error?.message ?? null, id: data ?? undefined };
}

export async function removeDraftCustomMoment(admin: SupabaseClient<Database>, episodeId: string, momentId: string, actorId: string): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("mutate_draft_moment", { p_episode_id: episodeId, p_actor_id: actorId, p_moment_id: momentId, p_couple_id: null, p_label: null, p_remove: true });
  return { error: error?.message ?? null };
}

export type SeasonSettingsInput = {
  seasonId: string;
  premiereDate: string | null;
  totalEpisodes: number | null;
  finaleDate: string | null;
};

// Schedule-tab display only ("TBD" when null) — episodes.airs_at stays the
// actual per-week source of truth every scoring/locking read uses, so this
// never feeds a computation.
export async function applySeasonSettings(
  admin: SupabaseClient<Database>,
  input: SeasonSettingsInput
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("seasons")
    .update({
      premiere_date: input.premiereDate,
      total_episodes: input.totalEpisodes,
      finale_date: input.finaleDate,
    })
    .eq("id", input.seasonId);
  return { error: error?.message ?? null };
}

export async function releaseDraftCouple(admin: SupabaseClient<Database>, episodeId: string, coupleId: string, actorId: string): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("set_draft_couple_release", { p_episode_id: episodeId, p_couple_id: coupleId, p_actor_id: actorId, p_release: true });
  return { error: error?.message ?? null };
}

export async function withdrawDraftCouple(admin: SupabaseClient<Database>, episodeId: string, coupleId: string, actorId: string): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("set_draft_couple_release", { p_episode_id: episodeId, p_couple_id: coupleId, p_actor_id: actorId, p_release: false });
  return { error: error?.message ?? null };
}

// Idempotent, admin-only seeding preserves an existing correction session.
export async function startCorrection(
  admin: SupabaseClient<Database>, episodeId: string, startedBy: string
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("seed_episode_correction", { p_episode_id: episodeId, p_started_by: startedBy });
  return { error: error?.message ?? null };
}
