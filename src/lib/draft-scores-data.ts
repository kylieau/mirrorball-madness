import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { slotActiveInWeek } from "@/lib/roster-couple-points";
import {
  draftReleaseLabel,
  draftScoresVisible,
  draftWeekManagerScores,
  findDraftRelease,
  type DraftManagerScore,
  type DraftRelease,
} from "@/lib/draft-scores";

export type VisibleDraftNight = DraftRelease & {
  isDoubleElimination: boolean;
  dances: {
    episodeId: string;
    coupleId: string;
    danceStyle: string;
    total: number;
    at: string;
  }[];
};

export type DraftScoreContext = {
  release: DraftRelease | null;
  // "{First} & {First} · N/M" (draftReleaseLabel) under "Draft scores
  // available", before the viewer unlocks. Release rows carry no scores.
  latestRelease: string | null;
  unlockedWeek: number;
  night: VisibleDraftNight | null;
};

const EMPTY_CONTEXT: DraftScoreContext = { release: null, latestRelease: null, unlockedWeek: 0, night: null };

// release is set whenever at least one couple's draft has been released for
// an unpublished night. night is set only after this viewer chose Mark
// Watched for that week. The score rows themselves come from a
// security-definer RPC so the draft tables stay ungranted.
export async function loadDraftScoreContext(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<DraftScoreContext> {
  const { data: seasonId } = await supabase.rpc("active_season_id");
  if (!seasonId) return EMPTY_CONTEXT;

  const [{ data: progress }, { data: episodes }, { data: weeks }, { data: releases }] = await Promise.all([
    supabase
      .from("spoiler_watch_progress")
      .select("draft_unlocked_week")
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .maybeSingle(),
    supabase.from("episodes").select("id, week_id, results_published_at").eq("season_id", seasonId),
    supabase.from("competition_weeks").select("id, week_number, is_double_elimination_week").eq("season_id", seasonId),
    // Not season-scoped at the query level (no season_id column) -- filtered
    // to this season's episode ids below, same as loadResultsPageData.
    supabase.from("draft_couple_releases").select("episode_id, couple_id, released_at"),
  ]);

  const seasonEpisodeIds = new Set((episodes ?? []).map((e) => e.id));
  const releasedCoupleIdsByEpisode = new Map<string, string[]>();
  for (const row of releases ?? []) {
    if (!seasonEpisodeIds.has(row.episode_id)) continue;
    const list = releasedCoupleIdsByEpisode.get(row.episode_id) ?? [];
    list.push(row.couple_id);
    releasedCoupleIdsByEpisode.set(row.episode_id, list);
  }

  const weekNumberById = new Map((weeks ?? []).map((week) => [week.id, week.week_number]));
  const release = findDraftRelease(episodes ?? [], weekNumberById, releasedCoupleIdsByEpisode);
  const unlockedWeek = progress?.draft_unlocked_week ?? 0;
  const latestRelease = release ? await loadLatestRelease(supabase, seasonId, releases ?? [], release) : null;
  if (!release || !draftScoresVisible(unlockedWeek, release.weekNumber)) {
    return { release, latestRelease, unlockedWeek, night: null };
  }

  const { data: dances, error } = await supabase.rpc("visible_draft_dance_scores");
  if (error || !dances) return { release, latestRelease, unlockedWeek, night: null };

  const week = (weeks ?? []).find((row) => row.id === release.weekId);
  return {
    release,
    latestRelease,
    unlockedWeek,
    night: {
      ...release,
      isDoubleElimination: week?.is_double_elimination_week ?? false,
      dances: dances
        .filter((row) => (release.releasedCoupleIdsByEpisode[row.episode_id] ?? []).includes(row.couple_id))
        .map((row) => ({
          episodeId: row.episode_id,
          coupleId: row.couple_id,
          danceStyle: row.dance_style_name,
          total: Number(row.total_score),
          at: row.created_at,
        })),
    },
  };
}

async function loadLatestRelease(
  supabase: SupabaseClient<Database>,
  seasonId: string,
  releases: { episode_id: string; couple_id: string; released_at: string }[],
  release: DraftRelease
): Promise<string | null> {
  const weekReleases = releases.filter((row) => release.episodeIds.includes(row.episode_id));
  const latest = [...weekReleases].sort((a, b) => b.released_at.localeCompare(a.released_at))[0];
  if (!latest) return null;
  const { data: couples } = await supabase
    .from("couples")
    .select("id, status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)")
    .eq("season_id", seasonId);
  return draftReleaseLabel({
    latestCoupleId: latest.couple_id,
    releasedCoupleIds: weekReleases.map((row) => row.couple_id),
    weekNumber: release.weekNumber,
    seasonCouples: (couples ?? []).map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
      status: c.status,
      elimination_week: c.elimination_week,
    })),
  });
}

export async function draftManagerScoresForLeague(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  night: VisibleDraftNight
): Promise<DraftManagerScore[]> {
  const [{ data: settings }, { data: slots }] = await Promise.all([
    supabase
      .from("scoring_settings")
      .select("judges_score_multiplier, judges_score_category_weight, judges_score_starts_week")
      .eq("league_id", leagueId)
      .single(),
    supabase.from("roster_slots").select("manager_id, couple_id, start_week, end_week").eq("league_id", leagueId),
  ]);
  if (!settings) return [];

  const rosterSlots = (slots ?? []).flatMap((slot) => {
    if (!slot.couple_id) return [];
    const period = {
      managerId: slot.manager_id,
      coupleId: slot.couple_id,
      startWeek: slot.start_week,
      endWeek: slot.end_week,
    };
    return slotActiveInWeek(period, night.weekNumber) ? [{ managerId: period.managerId, coupleId: period.coupleId }] : [];
  });

  return draftWeekManagerScores({
    weekNumber: night.weekNumber,
    anchorWeek: settings.judges_score_starts_week,
    judgesScoreMultiplier: settings.judges_score_multiplier,
    judgesCategoryWeight: settings.judges_score_category_weight,
    rosterSlots,
    danceScores: night.dances.map((dance) => ({ coupleId: dance.coupleId, totalScore: dance.total })),
  });
}
