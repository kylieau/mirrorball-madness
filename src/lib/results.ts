import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildWeeklyScoreRows } from "@/lib/weekly-score-rows";
import { participantIdsToPersist, selectableCast } from "@/lib/episode-cast";
import { sortJudgesForDisplay } from "@/lib/couple-display";
import { resolveGuestJudgeIds } from "@/lib/admin-people";
import type { ScoringJudge } from "@/lib/scoring-judges";

// The "propose" tier: a commissioner of any league can draft results, while
// only is_super_admin can publish them. Not league-scoped like
// is_league_commissioner — results entry is cross-league — but it matches the
// same identity parity, so a co-manager of a commissioner's team qualifies too.
export async function userIsAnyLeagueCommissioner(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("league_members")
    .select("id")
    .eq("role", "commissioner")
    .or(`user_id.eq.${userId},co_manager_id.eq.${userId}`)
    .limit(1);
  return (data ?? []).length > 0;
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

export async function recomputeWeekForReveal(
  admin: SupabaseClient<Database>,
  episodeId: string
): Promise<string | null> {
  const { seasonId, error: seasonErr } = await getActiveSeasonId(admin);
  if (seasonErr || !seasonId) return seasonErr;

  const { data: episode, error: episodeErr } = await admin
    .from("episodes")
    .select("id, week_id")
    .eq("id", episodeId)
    .single();
  if (episodeErr) return episodeErr.message;
  if (!episode.week_id) return null;

  const [{ data: week, error: weekErr }, { data: weekEpisodes, error: weekEpisodesErr }] = await Promise.all([
    admin
      .from("competition_weeks")
      .select("id, week_number, is_double_elimination_week")
      .eq("id", episode.week_id)
      .single(),
    admin.from("episodes").select("id").eq("week_id", episode.week_id),
  ]);
  if (weekErr) return weekErr.message;
  if (weekEpisodesErr) return weekEpisodesErr.message;

  return recomputeWeekScores(
    admin,
    seasonId,
    week,
    (weekEpisodes ?? []).map((row) => row.id),
    [],
    episode.id,
    { reveal: true }
  );
}

// Exported for retroactive recomputes from a script (a scoring-logic change
// applied to already-published weeks); in-app callers are below.
export async function recomputeWeekScores(
  admin: SupabaseClient<Database>,
  seasonId: string,
  week: {
    id: string;
    week_number: number;
    is_double_elimination_week: boolean;
  },
  episodeIds: string[],
  thisEpisodeOutcomeRows: { couple_id: string; outcome: string; bonus_points: number }[],
  thisEpisodeId: string,
  // Reveal mode: this episode's dance scores are posted but its outcomes are
  // not, so only judges points move. Curtain Call and Grand Finale wait for
  // the final publish.
  { reveal = false }: { reveal?: boolean } = {}
): Promise<string | null> {
  const reads = await Promise.all([
    admin.from("dance_scores").select("couple_id, total_score, scaled_score").in("episode_id", episodeIds),
    admin.from("episode_results").select("episode_id, couple_id, outcome, bonus_points").in("episode_id", episodeIds),
    admin.from("couples").select("id, status, elimination_week").eq("season_id", seasonId),
    admin.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", episodeIds),
    admin.from("leagues").select("id"),
    admin.from("scoring_settings").select("*"),
    admin.from("roster_slots").select("league_id, manager_id, couple_id, start_week, end_week"),
    admin.from("predictions").select("*").eq("week_id", week.id),
    admin.from("grand_finale_late_unlocks").select("*"),
    admin.from("grand_finale_predictions").select("*"),
  ]);
  for (const read of reads) if (read.error) return read.error.message;
  const [dances, outcomes, couples, jeopardy, leagues, settings, rosters, predictions, lateUnlocks, grandFinalePredictions] = reads;
  const rows = buildWeeklyScoreRows({
    dances: dances.data ?? [], outcomes: outcomes.data ?? [], couples: couples.data ?? [],
    jeopardy: jeopardy.data ?? [], leagues: leagues.data ?? [], settings: settings.data ?? [],
    rosters: rosters.data ?? [], predictions: predictions.data ?? [],
    lateUnlocks: lateUnlocks.data ?? [], grandFinalePredictions: grandFinalePredictions.data ?? [],
  }, week, thisEpisodeId, thisEpisodeOutcomeRows, { reveal });
  for (const league of leagues.data ?? []) {
    const { error: deleteErr } = await admin.from("weekly_manager_scores").delete().eq("league_id", league.id).eq("week_id", week.id);
    if (deleteErr) return deleteErr.message;
    const leagueRows = rows.filter((r) => r.league_id === league.id);
    if (leagueRows.length > 0) {
      const { error } = await admin.from("weekly_manager_scores").insert(leagueRows);
      if (error) return error.message;
    }
  }
  return null;
}
