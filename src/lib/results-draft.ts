import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Outcome } from "@/lib/scoring";

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
  wasBottomTwo: boolean;
  wasBottomThree: boolean;
  savedByJudges: boolean;
  wasTeamDance: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

export type SaveDraftResultsInput = {
  episodeId: string;
  guestJudgeName: string | null;
  judgesSaveAvailable: boolean;
  entries: DraftEntryInput[];
  updatedBy: string;
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
  wasBottomTwo: boolean;
  wasBottomThree: boolean;
  savedByJudges: boolean;
  wasTeamDance: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string | null;
};

export type DraftCustomMoment = { id: string; coupleId: string | null; label: string };

export type DraftState = {
  hasDraft: boolean;
  guestJudgeName: string | null;
  judgesSaveAvailable: boolean;
  updatedAt: string | null;
  dances: DraftDanceState[];
  entries: DraftEntryState[];
  customMoments: DraftCustomMoment[];
};

const EMPTY_DRAFT_STATE: DraftState = {
  hasDraft: false,
  guestJudgeName: null,
  judgesSaveAvailable: false,
  updatedAt: null,
  dances: [],
  entries: [],
  customMoments: [],
};

// Autosave path — cheap and draft-only. Does NOT touch couples.status or
// call computeWeeklyScores; that only happens at Publish, via the existing
// applyEpisodeResults. Same delete-then-reinsert pattern applyEpisodeResults
// already uses for the live tables, just against the draft ones.
export async function saveDraftResults(
  admin: SupabaseClient<Database>,
  input: SaveDraftResultsInput
): Promise<{ error: string | null }> {
  const { error: overrideErr } = await admin.from("draft_episode_overrides").upsert(
    {
      episode_id: input.episodeId,
      guest_judge_name: input.guestJudgeName,
      judges_save_available: input.judgesSaveAvailable,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy,
    },
    { onConflict: "episode_id" }
  );
  if (overrideErr) return { error: overrideErr.message };

  // draft_judge_scores cascades from draft_dance_scores, so clearing
  // draft_dance_scores is enough — same as the live tables.
  await admin.from("draft_dance_scores").delete().eq("episode_id", input.episodeId);
  await admin.from("draft_episode_results").delete().eq("episode_id", input.episodeId);

  // Inserted one dance at a time (not a bulk insert) so each row's real id
  // is known before inserting its judge_scores — same reasoning as
  // applyEpisodeResults.
  for (const entry of input.entries) {
    for (const dance of entry.dances) {
      const totalScore = dance.judgeScores.reduce((sum, js) => sum + js.score, 0);
      const { data: danceRow, error: danceErr } = await admin
        .from("draft_dance_scores")
        .insert({
          episode_id: input.episodeId,
          couple_id: entry.coupleId,
          dance_style_id: dance.danceStyleId,
          song_title: dance.songTitle,
          total_score: totalScore,
        })
        .select()
        .single();
      if (danceErr) return { error: danceErr.message };

      if (dance.judgeScores.length > 0) {
        const { error: judgeErr } = await admin.from("draft_judge_scores").insert(
          dance.judgeScores.map((js) => ({
            draft_dance_score_id: danceRow.id,
            judge_id: js.judgeId,
            score: js.score,
          }))
        );
        if (judgeErr) return { error: judgeErr.message };
      }
    }
  }

  const resultRows = input.entries.map((e) => ({
    episode_id: input.episodeId,
    couple_id: e.coupleId,
    outcome: e.outcome,
    was_bottom_two: e.wasBottomTwo,
    was_bottom_three: e.wasBottomThree,
    saved_by_judges: e.savedByJudges,
    was_team_dance: e.wasTeamDance,
    had_immunity: e.hadImmunity,
    bonus_points: e.bonusPoints,
    bonus_note: e.bonusNote,
  }));
  if (resultRows.length > 0) {
    const { error } = await admin.from("draft_episode_results").insert(resultRows);
    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function loadDraftForEpisode(
  admin: SupabaseClient<Database>,
  episodeId: string
): Promise<DraftState> {
  const [{ data: override }, { data: draftDances }, { data: draftResults }, { data: customMoments }] =
    await Promise.all([
      admin.from("draft_episode_overrides").select("*").eq("episode_id", episodeId).maybeSingle(),
      admin
        .from("draft_dance_scores")
        .select("id, couple_id, dance_style_id, song_title, draft_judge_scores(judge_id, score)")
        .eq("episode_id", episodeId),
      admin.from("draft_episode_results").select("*").eq("episode_id", episodeId),
      admin.from("draft_episode_custom_moments").select("id, couple_id, label").eq("episode_id", episodeId),
    ]);

  if (!override) return EMPTY_DRAFT_STATE;

  return {
    hasDraft: true,
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
      wasBottomTwo: r.was_bottom_two,
      wasBottomThree: r.was_bottom_three,
      savedByJudges: r.saved_by_judges,
      wasTeamDance: r.was_team_dance,
      hadImmunity: r.had_immunity,
      bonusPoints: r.bonus_points,
      bonusNote: r.bonus_note,
    })),
    customMoments: (customMoments ?? []).map((m) => ({ id: m.id, coupleId: m.couple_id, label: m.label })),
  };
}

export async function addDraftCustomMoment(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; coupleId: string | null; label: string; createdBy: string }
): Promise<{ error: string | null }> {
  const trimmed = input.label.trim();
  if (!trimmed) return { error: "Event label is required" };

  const { error } = await admin.from("draft_episode_custom_moments").insert({
    episode_id: input.episodeId,
    couple_id: input.coupleId,
    label: trimmed,
    created_by: input.createdBy,
  });
  return { error: error?.message ?? null };
}

export async function removeDraftCustomMoment(
  admin: SupabaseClient<Database>,
  momentId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.from("draft_episode_custom_moments").delete().eq("id", momentId);
  return { error: error?.message ?? null };
}
