import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  draftReleaseLabel,
  draftScoresVisible,
  findDraftRelease,
  type DraftRelease,
} from "@/lib/draft-scores";
import { loadAllCouples, loadViewerSeason } from "@/lib/viewer-season-data";

export type VisibleDraftNight = DraftRelease & {
  isDoubleElimination: boolean;
  dances: {
    episodeId: string;
    coupleId: string;
    danceStyle: string;
    total: number;
    scaled: number;
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
  const [season, { data: releases }] = await Promise.all([
    loadViewerSeason(supabase, userId),
    // Not season-scoped at the query level (no season_id column) -- filtered
    // to this season's episode ids below, same as loadResultsPageData.
    supabase.from("draft_couple_releases").select("episode_id, couple_id, released_at"),
  ]);
  const { seasonId, episodeRows: episodes, weekRows: weeks } = season;
  if (!seasonId) return EMPTY_CONTEXT;

  const seasonEpisodeIds = new Set(episodes.map((e) => e.id));
  const releasedCoupleIdsByEpisode = new Map<string, string[]>();
  for (const row of releases ?? []) {
    if (!seasonEpisodeIds.has(row.episode_id)) continue;
    const list = releasedCoupleIdsByEpisode.get(row.episode_id) ?? [];
    list.push(row.couple_id);
    releasedCoupleIdsByEpisode.set(row.episode_id, list);
  }

  const weekNumberById = new Map(weeks.map((week) => [week.id, week.week_number]));
  const release = findDraftRelease(episodes, weekNumberById, releasedCoupleIdsByEpisode);
  const unlockedWeek = season.draftUnlockedWeek;
  const visible = !!release && draftScoresVisible(unlockedWeek, release.weekNumber);
  const [latestRelease, dancesResult] = await Promise.all([
    release ? loadLatestRelease(supabase, seasonId, releases ?? [], release) : null,
    visible ? supabase.rpc("visible_draft_dance_scores") : null,
  ]);
  if (!release || !dancesResult || dancesResult.error || !dancesResult.data) {
    return { release, latestRelease, unlockedWeek, night: null };
  }
  const dances = dancesResult.data;

  const week = weeks.find((row) => row.id === release.weekId);
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
          scaled: Number(row.scaled_score),
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
  const couples = (await loadAllCouples(supabase)).filter((couple) => couple.season_id === seasonId);
  return draftReleaseLabel({
    latestCoupleId: latest.couple_id,
    releasedCoupleIds: weekReleases.map((row) => row.couple_id),
    weekNumber: release.weekNumber,
    seasonCouples: couples.map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
      status: c.status,
      elimination_week: c.elimination_week,
    })),
  });
}
