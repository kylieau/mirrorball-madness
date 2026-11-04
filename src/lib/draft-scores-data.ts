import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { danceMaxScore, danceScoreColumns } from "@/lib/episode-teams";
import type { DanceScore } from "@/lib/scoring";
import {
  draftReleaseLabel,
  draftScoresVisible,
  findDraftRelease,
  type DraftDance,
  type DraftRelease,
} from "@/lib/draft-scores";
import { loadAllCouples, loadTeamsMode, loadViewerSeason } from "@/lib/viewer-season-data";

export type VisibleDraftNight = DraftRelease & {
  isDoubleElimination: boolean;
  dances: DraftDance[];
  // The week's live rows, which still count on a draft night
  // (draftNightDanceScores).
  liveDances: DanceScore[];
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

// release is set whenever at least one couple's draft or special dance has
// been released for an unpublished night. night is set only after this viewer
// chose Mark Watched for that week. The score rows themselves come from
// security-definer RPCs so the draft tables stay ungranted. Special releases
// read as none before supabase/apply-special-draft-release.sql is applied.
export async function loadDraftScoreContext(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<DraftScoreContext> {
  const [season, { data: releases }, { data: specialReleaseRows }] = await Promise.all([
    loadViewerSeason(supabase, userId),
    // Not season-scoped at the query level (no season_id column) -- filtered
    // to this season's episode ids below, same as loadResultsPageData.
    supabase.from("draft_couple_releases").select("episode_id, couple_id, released_at"),
    supabase.from("draft_special_releases").select("episode_id, team_id, released_at"),
  ]);
  const { seasonId, episodeRows: episodes, weekRows: weeks } = season;
  if (!seasonId) return EMPTY_CONTEXT;

  const seasonEpisodeIds = new Set(episodes.map((e) => e.id));
  const coupleReleases = (releases ?? []).filter((row) => seasonEpisodeIds.has(row.episode_id));
  const specialReleases = (specialReleaseRows ?? []).filter((row) => seasonEpisodeIds.has(row.episode_id));
  const releasedCoupleIdsByEpisode = groupByEpisode(coupleReleases.map((row) => [row.episode_id, row.couple_id]));
  const releasedTeamIdsByEpisode = groupByEpisode(specialReleases.map((row) => [row.episode_id, row.team_id]));

  const weekNumberById = new Map(weeks.map((week) => [week.id, week.week_number]));
  const release = findDraftRelease(episodes, weekNumberById, releasedCoupleIdsByEpisode, releasedTeamIdsByEpisode);
  const unlockedWeek = season.draftUnlockedWeek;
  const visible = !!release && draftScoresVisible(unlockedWeek, release.weekNumber);
  const [latestRelease, dancesResult, specialResult, liveDances] = await Promise.all([
    release ? loadLatestRelease(supabase, seasonId, coupleReleases, specialReleases, release) : null,
    visible ? supabase.rpc("visible_draft_dance_scores") : null,
    visible && specialReleases.length > 0 ? supabase.rpc("visible_draft_special_scores") : null,
    // Every night of the week, not only the ones with a release: a sibling
    // night's posted scores still count on this week's draft standings.
    visible ? loadLiveDances(supabase, episodes.filter((e) => e.week_id === release.weekId).map((e) => e.id)) : [],
  ]);
  if (!release || !dancesResult || dancesResult.error || !dancesResult.data) {
    return { release, latestRelease, unlockedWeek, night: null };
  }
  const releasedTeams = new Set(Object.values(release.releasedTeamIdsByEpisode).flat());

  const week = weeks.find((row) => row.id === release.weekId);
  return {
    release,
    latestRelease,
    unlockedWeek,
    night: {
      ...release,
      isDoubleElimination: week?.is_double_elimination_week ?? false,
      dances: [
        ...dancesResult.data
          .filter((row) => (release.releasedCoupleIdsByEpisode[row.episode_id] ?? []).includes(row.couple_id))
          .map((row) => ({
            episodeId: row.episode_id,
            coupleId: row.couple_id,
            teamId: null,
            danceStyle: row.dance_style_name,
            total: Number(row.total_score),
            scaled: Number(row.scaled_score),
            maxScore: null,
            at: row.created_at,
          })),
        ...(specialResult?.data ?? [])
          .filter((row) => releasedTeams.has(row.team_id))
          .map((row) => ({
            episodeId: row.episode_id,
            coupleId: row.couple_id,
            teamId: row.team_id,
            danceStyle: row.dance_style_name,
            total: Number(row.total_score),
            scaled: Number(row.scaled_score),
            maxScore: Number(row.max_score),
            at: row.created_at,
          })),
      ],
      liveDances,
    },
  };
}

async function loadLiveDances(supabase: SupabaseClient<Database>, episodeIds: string[]): Promise<DanceScore[]> {
  const mode = await loadTeamsMode(supabase);
  const { data } = await supabase
    .from("dance_scores")
    .select(danceScoreColumns(mode, "episode_id, couple_id, total_score, scaled_score", { teamId: true }))
    .in("episode_id", episodeIds);
  return ((data ?? []) as unknown as { episode_id: string; couple_id: string; total_score: number; scaled_score: number; max_score?: number | null; team_id?: string | null }[]).map(
    (row) => ({
      episodeId: row.episode_id,
      coupleId: row.couple_id,
      totalScore: Number(row.total_score),
      scaledScore: Number(row.scaled_score),
      maxScore: danceMaxScore(row),
      teamId: row.team_id ?? null,
    })
  );
}

function groupByEpisode(pairs: [string, string][]): Map<string, string[]> {
  const byEpisode = new Map<string, string[]>();
  for (const [episodeId, id] of pairs) byEpisode.set(episodeId, [...(byEpisode.get(episodeId) ?? []), id]);
  return byEpisode;
}

// Released couples count every couple with a released dance: its own, or as
// a participant in a released special dance.
async function loadLatestRelease(
  supabase: SupabaseClient<Database>,
  seasonId: string,
  coupleReleases: { episode_id: string; couple_id: string; released_at: string }[],
  specialReleases: { episode_id: string; team_id: string; released_at: string }[],
  release: DraftRelease
): Promise<string | null> {
  const inWeek = (row: { episode_id: string }) => release.episodeIds.includes(row.episode_id);
  const weekCouples = coupleReleases.filter(inWeek);
  const weekSpecials = specialReleases.filter(inWeek);
  const teamIds = weekSpecials.map((row) => row.team_id);
  const [allCouples, teams, members] = await Promise.all([
    loadAllCouples(supabase),
    teamIds.length > 0 ? supabase.from("episode_teams").select("id, name").in("id", teamIds) : null,
    teamIds.length > 0 ? supabase.from("episode_team_members").select("couple_id").in("team_id", teamIds) : null,
  ]);
  const latest = [
    ...weekCouples.map((row) => ({ at: row.released_at, latest: { coupleId: row.couple_id } })),
    ...weekSpecials.map((row) => ({
      at: row.released_at,
      latest: { specialName: teams?.data?.find((team) => team.id === row.team_id)?.name ?? "Special dance" },
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!latest) return null;
  const couples = allCouples.filter((couple) => couple.season_id === seasonId);
  return draftReleaseLabel({
    latest: latest.latest,
    releasedCoupleIds: [...weekCouples.map((row) => row.couple_id), ...(members?.data ?? []).map((row) => row.couple_id)],
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
