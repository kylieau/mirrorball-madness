import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { recomputeWeekForReveal } from "@/lib/results";
import { couplesRevealState } from "@/lib/reveal-state";

async function episodeIsUnpublished(admin: SupabaseClient<Database>, episodeId: string): Promise<string | null> {
  const { data: episode, error } = await admin
    .from("episodes")
    .select("results_published_at")
    .eq("id", episodeId)
    .single();
  if (error) return error.message;
  return episode.results_published_at ? "This episode's results are already published" : null;
}

// A revealed couple is one whose dance scores are live while the episode has
// no published results. Returns each couple's latest post time.
export async function loadRevealedCouples(
  admin: SupabaseClient<Database>,
  episodeId: string
): Promise<Map<string, string>> {
  const { data: episode } = await admin
    .from("episodes")
    .select("results_published_at")
    .eq("id", episodeId)
    .single();
  const revealed = new Map<string, string>();
  if (!episode || episode.results_published_at) return revealed;

  const { data: live } = await admin.from("dance_scores").select("couple_id, created_at").eq("episode_id", episodeId);
  for (const row of live ?? []) {
    const current = revealed.get(row.couple_id);
    if (!current || row.created_at > current) revealed.set(row.couple_id, row.created_at);
  }
  return revealed;
}

// Live dances for the couples already revealed, in the draft's input shape, so
// a later autosave can't change a score viewers can already see.
export async function loadRevealedDances(
  admin: SupabaseClient<Database>,
  episodeId: string
) {
  const revealed = await loadRevealedCouples(admin, episodeId);
  if (revealed.size === 0) return new Map<string, RevealedDance[]>();

  const { data: live } = await admin
    .from("dance_scores")
    .select("couple_id, dance_style_id, song_title, judge_scores(judge_id, score)")
    .eq("episode_id", episodeId);

  const byCouple = new Map<string, RevealedDance[]>();
  for (const row of live ?? []) {
    const list = byCouple.get(row.couple_id) ?? [];
    list.push({
      danceStyleId: row.dance_style_id,
      songTitle: row.song_title,
      judgeScores: (row.judge_scores ?? []).map((js) => ({ judgeId: js.judge_id, score: Number(js.score) })),
    });
    byCouple.set(row.couple_id, list);
  }
  return byCouple;
}

export type RevealedDance = {
  danceStyleId: string;
  songTitle: string | null;
  judgeScores: { judgeId: string; score: number }[];
};

export async function revealCouple(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; coupleId: string }
): Promise<{ error: string | null }> {
  const unpublishedErr = await episodeIsUnpublished(admin, input.episodeId);
  if (unpublishedErr) return { error: unpublishedErr };

  const revealed = await loadRevealedCouples(admin, input.episodeId);
  if (revealed.has(input.coupleId)) return { error: "This couple's scores are already posted" };

  const { data: draftDances, error: draftErr } = await admin
    .from("draft_dance_scores")
    .select("couple_id, dance_style_id, song_title, draft_judge_scores(judge_id, score)")
    .eq("episode_id", input.episodeId)
    .eq("couple_id", input.coupleId);
  if (draftErr) return { error: draftErr.message };

  const dances = draftDances ?? [];
  const state = couplesRevealState(
    dances.map((d) => ({ coupleId: d.couple_id, judgeScores: d.draft_judge_scores ?? [] })),
    new Set()
  ).get(input.coupleId);
  if (state !== "ready") return { error: "This couple's scores aren't complete in the saved draft yet" };

  for (const dance of dances) {
    const judgeScores = dance.draft_judge_scores ?? [];
    const { data: danceRow, error: danceErr } = await admin
      .from("dance_scores")
      .insert({
        episode_id: input.episodeId,
        couple_id: input.coupleId,
        dance_style_id: dance.dance_style_id,
        song_title: dance.song_title,
        total_score: judgeScores.reduce((sum, js) => sum + Number(js.score), 0),
      })
      .select()
      .single();
    if (danceErr) {
      await admin.from("dance_scores").delete().eq("episode_id", input.episodeId).eq("couple_id", input.coupleId);
      return { error: danceErr.message };
    }

    const { error: judgeErr } = await admin.from("judge_scores").insert(
      judgeScores.map((js) => ({ dance_score_id: danceRow.id, judge_id: js.judge_id, score: js.score }))
    );
    if (judgeErr) {
      await admin.from("dance_scores").delete().eq("episode_id", input.episodeId).eq("couple_id", input.coupleId);
      return { error: judgeErr.message };
    }
  }

  const recomputeErr = await recomputeWeekForReveal(admin, input.episodeId);
  if (recomputeErr) {
    await admin.from("dance_scores").delete().eq("episode_id", input.episodeId).eq("couple_id", input.coupleId);
    return { error: recomputeErr };
  }
  return { error: null };
}

export async function undoReveal(
  admin: SupabaseClient<Database>,
  input: { episodeId: string; coupleId: string }
): Promise<{ error: string | null }> {
  const unpublishedErr = await episodeIsUnpublished(admin, input.episodeId);
  if (unpublishedErr) return { error: unpublishedErr };

  const { error } = await admin
    .from("dance_scores")
    .delete()
    .eq("episode_id", input.episodeId)
    .eq("couple_id", input.coupleId);
  if (error) return { error: error.message };

  return { error: await recomputeWeekForReveal(admin, input.episodeId) };
}
