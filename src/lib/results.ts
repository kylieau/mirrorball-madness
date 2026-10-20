import type { PublicationSnapshot } from "./episode-publication";
import type { Json } from "./supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildWeeklyScoreRows } from "@/lib/weekly-score-rows";
import { participantIdsToPersist, selectableCast } from "@/lib/episode-cast";
import { sortJudgesForDisplay } from "@/lib/couple-display";
import { resolveGuestJudgeIds } from "@/lib/admin-people";
import type { ScoringJudge } from "@/lib/scoring-judges";

// Global results entry is an explicit site-admin grant, independent of league creation.
export async function userCanProposeResults(
  admin: SupabaseClient<Database>, userId: string
): Promise<boolean> {
  const { data, error } = await admin.from("profiles")
    .select("is_super_admin, can_propose_results").eq("id", userId).single();
  if (error) throw new Error("Could not verify results-entry access.");
  return !!data && (data.is_super_admin || data.can_propose_results);
}

// The three small managed lists: scoring judges, dance styles (with category),
// and round types. Shared by /admin/show-settings (which needs nothing else)
// and loadResultsPageData (which also joins episode → round type).
export async function loadResultsTaxonomy(
  supabase: SupabaseClient<Database>
): Promise<{
  judges: ScoringJudge[];
  danceStyles: { id: string; name: string; category: string | null }[];
  roundTypes: { id: string; name: string }[];
}> {
  const [{ data: judges }, { data: danceStyles }, { data: roundTypes }] = await Promise.all([
    supabase.from("people").select("id, name, archived_at").eq("role", "judge").order("name"),
    supabase.from("dance_styles").select("id, name, category").order("name"),
    supabase.from("round_types").select("id, name").order("name"),
  ]);

  return {
    judges: sortJudgesForDisplay(
      (judges ?? []).map((j) => ({ id: j.id, name: j.name, archivedAt: j.archived_at }))
    ),
    danceStyles: danceStyles ?? [],
    roundTypes: roundTypes ?? [],
  };
}

async function getActiveSeasonId(
  admin: SupabaseClient<Database>
): Promise<{ seasonId: string | null; error: string | null }> {
  const { data: season, error } = await admin
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .single();
  return { seasonId: season?.id ?? null, error: error?.message ?? (season ? null : "No active season") };
}

export type ScheduleEpisodeInput = {
  episodeId: string | null;
  episodeNumber: number;
  // Null = exhibition / not on Results-Picks. Otherwise find-or-create that
  // competition week and attach this TV airing to it.
  competitionWeekNumber: number | null;
  weekTheme: string | null;
  airsAt: string;
  theme: string | null;
  isEliminationWeek: boolean;
  isFinale: boolean;
  isDoubleEliminationWeek: boolean;
  // Empty = unrestricted (every currently-active couple participates) — the
  // ordinary case. Only populated for a split-broadcast episode (e.g. a
  // two-night premiere where half the cast dances each night).
  participantCoupleIds: string[];
  roundTypeIds: string[];
  // Names, not ids, so Schedule can add a first-time guest in the same save.
  guestJudgeNames: string[];
  expectedDanceCount: number;
  judgesSaveAvailable: boolean;
  durationMinutes: number;
};

async function deleteWeekIfEmpty(
  admin: SupabaseClient<Database>,
  weekId: string | null
): Promise<string | null> {
  if (!weekId) return null;
  const { data: remaining, error } = await admin.from("episodes").select("id").eq("week_id", weekId).limit(1);
  if (error) return error.message;
  if ((remaining ?? []).length > 0) return null;
  const { error: deleteErr } = await admin.from("competition_weeks").delete().eq("id", weekId);
  return deleteErr?.message ?? null;
}

// Sets everything known ahead of air: episode number, date, theme, week
// assignment, who's performing, round types, and dances per couple. Status
// stays owned by publish.
export async function applyEpisodeSchedule(
  admin: SupabaseClient<Database>,
  input: ScheduleEpisodeInput
): Promise<{ error: string | null }> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return { error: seasonErr };

  if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1) {
    return { error: "Episode number must be a positive integer." };
  }
  if (input.competitionWeekNumber != null && (input.competitionWeekNumber < 1 || !Number.isInteger(input.competitionWeekNumber))) {
    return { error: "Competition week must be a positive integer, or blank for exhibition." };
  }
  if (!Number.isInteger(input.expectedDanceCount) || input.expectedDanceCount < 1) {
    return { error: "Dances per couple must be a positive integer." };
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) {
    return { error: "Duration must be a positive number of minutes." };
  }

  let weekId: string | null = null;
  if (input.competitionWeekNumber != null) {
    const { data: existingWeek } = await admin
      .from("competition_weeks")
      .select("id, theme")
      .eq("season_id", seasonId)
      .eq("week_number", input.competitionWeekNumber)
      .maybeSingle();

    const weekTheme = input.weekTheme?.trim() || existingWeek?.theme || input.theme;
    const { data: week, error: weekErr } = await admin
      .from("competition_weeks")
      .upsert(
        {
          season_id: seasonId,
          week_number: input.competitionWeekNumber,
          theme: weekTheme,
          is_elimination_week: input.isEliminationWeek,
          is_finale: input.isFinale,
          is_double_elimination_week: input.isDoubleEliminationWeek,
        },
        { onConflict: "season_id,week_number" }
      )
      .select("id")
      .single();
    if (weekErr) return { error: weekErr.message };
    weekId = week.id;
  }

  const previousWeekId = input.episodeId
    ? ((await admin.from("episodes").select("week_id").eq("id", input.episodeId).maybeSingle()).data?.week_id ?? null)
    : null;

  const episodeFields = {
    season_id: seasonId,
    episode_number: input.episodeNumber,
    week_id: weekId,
    airs_at: input.airsAt,
    theme: input.theme,
    expected_dance_count: input.expectedDanceCount,
    judges_save_available: input.judgesSaveAvailable,
    duration_minutes: input.durationMinutes,
  };

  const { data: episode, error } = input.episodeId
    ? await admin.from("episodes").update(episodeFields).eq("id", input.episodeId).select().single()
    : await admin.from("episodes").insert(episodeFields).select().single();
  if (error) return { error: error.message };

  if (previousWeekId && previousWeekId !== weekId) {
    const emptyErr = await deleteWeekIfEmpty(admin, previousWeekId);
    if (emptyErr) return { error: emptyErr };
  }

  const { data: seasonCouples, error: couplesErr } = await admin
    .from("couples")
    .select("id, status, elimination_week")
    .eq("season_id", seasonId);
  if (couplesErr) return { error: couplesErr.message };

  const castWeek = input.competitionWeekNumber ?? input.episodeNumber;
  const selectableIds = selectableCast(seasonCouples ?? [], castWeek, {
    published: episode.results_published_at != null,
  }).map((c) => c.id);
  const toWrite = participantIdsToPersist(input.participantCoupleIds, selectableIds);

  await admin.from("episode_participants").delete().eq("episode_id", episode.id);
  if (toWrite.length > 0) {
    const { error: participantsErr } = await admin.from("episode_participants").insert(
      toWrite.map((coupleId) => ({ episode_id: episode.id, couple_id: coupleId }))
    );
    if (participantsErr) return { error: participantsErr.message };
  }

  const roundTypeIds = [...new Set(input.roundTypeIds)];
  await admin.from("episode_round_types").delete().eq("episode_id", episode.id);
  if (roundTypeIds.length > 0) {
    const { error: roundTypesErr } = await admin.from("episode_round_types").insert(
      roundTypeIds.map((roundTypeId) => ({ episode_id: episode.id, round_type_id: roundTypeId }))
    );
    if (roundTypesErr) return { error: roundTypesErr.message };
  }

  const { ids: guestJudgeIds, error: guestsErr } = await resolveGuestJudgeIds(admin, input.guestJudgeNames);
  if (guestsErr) return { error: guestsErr };
  await admin.from("episode_guest_judges").delete().eq("episode_id", episode.id);
  if (guestJudgeIds.length > 0) {
    const { error: guestInsertErr } = await admin.from("episode_guest_judges").insert(
      guestJudgeIds.map((judgeId) => ({ episode_id: episode.id, judge_id: judgeId }))
    );
    if (guestInsertErr) return { error: guestInsertErr.message };
  }

  return { error: null };
}

// Only fully published weeks may be recomputed; installation is atomic.
export async function recomputeWeekScores(
  admin: SupabaseClient<Database>, seasonId: string,
  week: { id: string; week_number: number; is_double_elimination_week: boolean },
  episodeIds: string[], thisEpisodeOutcomeRows: { couple_id: string; outcome: string; bonus_points: number }[],
  thisEpisodeId: string
): Promise<string | null> {
  const { data, error } = await admin.rpc("episode_publication_snapshot", { p_episode_id: thisEpisodeId });
  if (error) return error.message;
  const snapshot = data as unknown as PublicationSnapshot;
  if (snapshot.season?.id !== seasonId) return "The active season changed. Please try again.";
  const ids = new Set(episodeIds);
  const rows = buildWeeklyScoreRows({
    episodes: snapshot.episodes,
    dances: snapshot.dances.filter((row) => ids.has(row.episode_id)),
    outcomes: snapshot.outcomes.filter((row) => ids.has(row.episode_id)),
    jeopardy: snapshot.jeopardy.filter((row) => ids.has(row.episode_id)),
    couples: snapshot.couples, leagues: snapshot.leagues, settings: snapshot.settings,
    rosters: snapshot.rosters, predictions: snapshot.predictions,
    lateUnlocks: snapshot.lateUnlocks, grandFinalePredictions: snapshot.grandFinalePredictions,
  }, week, thisEpisodeId, thisEpisodeOutcomeRows);
  const result = await admin.rpc("replace_weekly_scores", { p_episode_id: thisEpisodeId, p_revision: snapshot._revision!, p_rows: rows as unknown as Json });
  return result.error?.message ?? null;
}
