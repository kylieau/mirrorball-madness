import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Outcome } from "@/lib/scoring";
import { applyEpisodeResults, type EntrySubmission } from "@/lib/results";

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

async function deleteAllDraftRows(admin: SupabaseClient<Database>, episodeId: string): Promise<void> {
  // draft_judge_scores cascades from draft_dance_scores, so clearing that
  // is enough for those two.
  await admin.from("draft_episode_overrides").delete().eq("episode_id", episodeId);
  await admin.from("draft_dance_scores").delete().eq("episode_id", episodeId);
  await admin.from("draft_episode_results").delete().eq("episode_id", episodeId);
  await admin.from("draft_episode_custom_moments").delete().eq("episode_id", episodeId);
}

// Builds an EpisodeResultsInput from the draft tables and calls the
// existing, unmodified-in-signature applyEpisodeResults — the scoring/
// prediction/Grand-Finale logic is never forked for drafts. On success,
// promotes the episode-level fields and custom moments into the live
// tables and deletes every draft row; on error, returns it and leaves all
// draft rows intact so nothing gets promoted.
export async function publishEpisodeDraft(
  admin: SupabaseClient<Database>,
  episodeId: string,
  publishedBy: string
): Promise<{ error: string | null }> {
  const draft = await loadDraftForEpisode(admin, episodeId);
  if (!draft.hasDraft) return { error: "No draft to publish for this episode" };

  const { data: episode, error: episodeErr } = await admin
    .from("episodes")
    .select("id, week_id, airs_at, theme")
    .eq("id", episodeId)
    .single();
  if (episodeErr || !episode) return { error: episodeErr?.message ?? "Episode not found" };

  const dancesByCouple = new Map<string, DraftDanceState[]>();
  for (const d of draft.dances) {
    const list = dancesByCouple.get(d.coupleId) ?? [];
    list.push(d);
    dancesByCouple.set(d.coupleId, list);
  }

  // Derived from what was actually entered, not separately tracked — the
  // form's "Dances (Per Couple)" field only caps how many rows you can add
  // per couple while drafting, it isn't itself persisted anywhere.
  const expectedDanceCount = Math.max(1, ...[...dancesByCouple.values()].map((list) => list.length));

  const entries: EntrySubmission[] = draft.entries.map((e) => ({
    coupleId: e.coupleId,
    dances: (dancesByCouple.get(e.coupleId) ?? []).map((d) => ({
      danceStyleId: d.danceStyleId,
      songTitle: d.songTitle,
      judgeScores: d.judgeScores,
    })),
    outcome: e.outcome,
    savedByJudges: e.savedByJudges,
    wasTeamDance: e.wasTeamDance,
    hadImmunity: e.hadImmunity,
    bonusPoints: e.bonusPoints,
    bonusNote: e.bonusNote,
  }));

  const result = await applyEpisodeResults(admin, {
    episodeId,
    expectedDanceCount,
    entries,
  });
  if (result.error) return result;

  const { error: publishErr } = await admin
    .from("episodes")
    .update({
      guest_judge_name: draft.guestJudgeName,
      judges_save_available: draft.judgesSaveAvailable,
      results_published_at: new Date().toISOString(),
      results_published_by: publishedBy,
    })
    .eq("id", episodeId);
  if (publishErr) return { error: publishErr.message };

  await admin.from("episode_custom_moments").delete().eq("episode_id", episodeId);
  if (draft.customMoments.length > 0) {
    const { error: momentsErr } = await admin.from("episode_custom_moments").insert(
      draft.customMoments.map((m) => ({
        episode_id: episodeId,
        couple_id: m.coupleId,
        label: m.label,
        created_by: publishedBy,
      }))
    );
    if (momentsErr) return { error: momentsErr.message };
  }

  await deleteAllDraftRows(admin, episodeId);
  return { error: null };
}

// Unconditionally overwrites the draft tables with copies of the live
// data for this episode — the caller confirms first ("this discards any
// unsaved draft edits for this week"), since overwriting an in-progress
// unpublished draft is the one surprising case.
export async function startCorrection(
  admin: SupabaseClient<Database>,
  episodeId: string,
  startedBy: string
): Promise<{ error: string | null }> {
  const [{ data: episode, error: episodeErr }, { data: liveDances }, { data: liveResults }, { data: liveMoments }] =
    await Promise.all([
      admin.from("episodes").select("guest_judge_name, judges_save_available").eq("id", episodeId).single(),
      admin
        .from("dance_scores")
        .select("couple_id, dance_style_id, song_title, total_score, judge_scores(judge_id, score)")
        .eq("episode_id", episodeId),
      admin.from("episode_results").select("*").eq("episode_id", episodeId),
      admin.from("episode_custom_moments").select("couple_id, label").eq("episode_id", episodeId),
    ]);
  if (episodeErr || !episode) return { error: episodeErr?.message ?? "Episode not found" };

  await deleteAllDraftRows(admin, episodeId);

  const { error: overrideErr } = await admin.from("draft_episode_overrides").insert({
    episode_id: episodeId,
    guest_judge_name: episode.guest_judge_name,
    judges_save_available: episode.judges_save_available,
    updated_by: startedBy,
  });
  if (overrideErr) return { error: overrideErr.message };

  for (const d of liveDances ?? []) {
    const { data: draftDance, error: danceErr } = await admin
      .from("draft_dance_scores")
      .insert({
        episode_id: episodeId,
        couple_id: d.couple_id,
        dance_style_id: d.dance_style_id,
        song_title: d.song_title,
        total_score: d.total_score,
      })
      .select()
      .single();
    if (danceErr) return { error: danceErr.message };

    const judgeScores = d.judge_scores ?? [];
    if (judgeScores.length > 0) {
      const { error: judgeErr } = await admin.from("draft_judge_scores").insert(
        judgeScores.map((js) => ({
          draft_dance_score_id: draftDance.id,
          judge_id: js.judge_id,
          score: js.score,
        }))
      );
      if (judgeErr) return { error: judgeErr.message };
    }
  }

  if ((liveResults ?? []).length > 0) {
    const { error: resultsErr } = await admin.from("draft_episode_results").insert(
      liveResults!.map((r) => ({
        episode_id: episodeId,
        couple_id: r.couple_id,
        outcome: r.outcome,
        saved_by_judges: r.saved_by_judges,
        was_team_dance: r.was_team_dance,
        had_immunity: r.had_immunity,
        bonus_points: r.bonus_points,
        bonus_note: r.bonus_note,
      }))
    );
    if (resultsErr) return { error: resultsErr.message };
  }

  if ((liveMoments ?? []).length > 0) {
    const { error: momentsErr } = await admin.from("draft_episode_custom_moments").insert(
      liveMoments!.map((m) => ({ episode_id: episodeId, couple_id: m.couple_id, label: m.label }))
    );
    if (momentsErr) return { error: momentsErr.message };
  }

  return { error: null };
}
