import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadResultsTaxonomy } from "@/lib/results";
import { loadDraftForEpisode, type DraftState } from "@/lib/results-draft";
import type { ScoringJudge } from "@/lib/scoring-judges";
import { danceScoreColumns, detectTeamsMode, EMPTY_TEAMS_LOAD, loadEpisodeTeams, type TeamsMode } from "@/lib/episode-teams";
import type { SpecialDance, SpecialDanceScore, TeamMark } from "@/lib/team-dances";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type CoupleWithStatus = Couple & { status: string; elimination_week: number | null };

export type ResultsPageData = {
  activeCouples: Couple[];
  allCouples: Couple[];
  allCouplesWithStatus: CoupleWithStatus[];
  judges: ScoringJudge[];
  danceStyles: { id: string; name: string; category: string | null }[];
  roundTypes: { id: string; name: string }[];
  episodes: {
    id: string;
    episode_number: number;
    week_id: string | null;
    airs_at: string;
    theme: string | null;
    expected_dance_count: number;
    judges_save_available: boolean;
    duration_minutes: number;
    status: string;
    results_published_at: string | null;
    results_published_by: string | null;
  }[];
  weeks: {
    id: string;
    week_number: number;
    theme: string | null;
    is_elimination_week: boolean;
    is_finale: boolean;
    is_double_elimination_week: boolean;
  }[];
  danceScores: {
    id: string;
    episode_id: string;
    couple_id: string;
    dance_style_id: string;
    song_title: string | null;
    total_score: number;
    created_at: string;
    // Null for a couple's own dance; a special dance's id for its score for
    // them. Always null before supabase/apply-team-dance-entity.sql is applied.
    team_id: string | null;
    // The marks possible for a special dance's row (0 for a bonus round in
    // points); null for a couple's own row and before
    // supabase/apply-special-dances.sql is applied.
    max_score: number | null;
  }[];
  judgeScores: { dance_score_id: string; judge_id: string; score: number }[];
  episodeResults: {
    episode_id: string;
    couple_id: string;
    outcome: string;
    saved_by_judges: boolean;
    had_immunity: boolean;
    bonus_points: number;
    bonus_note: string | null;
  }[];
  draftsByEpisode: Record<string, DraftState>;
  // Couples whose OWN scores are live while the episode is still unpublished,
  // with their latest post time (drives Posted rows and the undo window). A
  // team's row for a couple never makes them posted.
  revealedByEpisode: Record<string, Record<string, string>>;
  // "special" once supabase/apply-special-dances.sql is applied, "entity"
  // with only supabase/apply-team-dance-entity.sql, else "none" (no special
  // dances, no team_id selected).
  teamsMode: TeamsMode;
  teamsByEpisode: Record<string, SpecialDance[]>;
  teamMarksByTeam: Record<string, TeamMark[]>;
  // Saved points and results per Points-mode special dance (special mode).
  teamScoresByTeam: Record<string, SpecialDanceScore[]>;
  // Live rows per special dance: the couples carrying it and each one's
  // total (one shared total for marks, per couple for points).
  teamLiveByTeam: Record<string, { total: number; coupleIds: string[]; totalByCouple: Record<string, number> }>;
  // Couples released from the draft to Spoiler-Free fans (draft_couple_releases),
  // per episode -- per couple, not a whole-episode flag.
  releasedCoupleIdsByEpisode: Record<string, string[]>;
  // Special dances released the same way (draft_special_releases); empty
  // before supabase/apply-special-draft-release.sql is applied.
  releasedTeamIdsByEpisode: Record<string, string[]>;
  publishedByNames: Record<string, string>;
  season: {
    id: string;
    premiere_date: string | null;
    total_episodes: number | null;
    finale_date: string | null;
    season_number: number | null;
  } | null;
  participantsByEpisode: Record<string, string[]>;
  roundTypesByEpisode: Record<string, string[]>;
  // Judge ids (people rows), per episode.
  guestJudgesByEpisode: Record<string, string[]>;
  inJeopardyByEpisode: Record<string, string[]>;
};

// Shared by /admin/results (Scores: By Week / By Couple), /admin/results/enter and
// /admin/schedule — they all need the same season's episodes/weeks/drafts/roster,
// just render different subsets of it, so the query shape can't drift
// between the two pages. `admin` is the service-role client, needed only for
// reading draft rows (draft_* tables grant nothing to authenticated).
export async function loadResultsPageData(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>
): Promise<ResultsPageData> {
  const [{ data: activeSeasonId }, teamsMode] = await Promise.all([supabase.rpc("active_season_id"), detectTeamsMode(supabase)]);

  const { data: season } = await supabase
    .from("seasons")
    .select("id, premiere_date, total_episodes, finale_date, season_number")
    .eq("id", activeSeasonId ?? "")
    .single();

  const coupleFields =
    "id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)";

  const [
    { data: activeCouplesRaw },
    { data: allCouplesRaw },
    { judges, danceStyles, roundTypes },
    { data: episodes },
    { data: weeks },
    { data: danceScores },
    { data: judgeScores },
    { data: episodeResults },
    { data: episodeParticipants },
    { data: episodeRoundTypes },
    { data: episodeGuestJudges },
    { data: inJeopardyRows },
    { data: draftReleases },
    { data: specialReleases },
  ] = await Promise.all([
    supabase
      .from("couples")
      .select(coupleFields)
      .eq("status", "active")
      .eq("season_id", activeSeasonId ?? ""),
    supabase
      .from("couples")
      .select(`${coupleFields}, status, elimination_week`)
      .eq("season_id", activeSeasonId ?? ""),
    loadResultsTaxonomy(supabase),
    supabase
      .from("episodes")
      .select(
        "id, episode_number, week_id, airs_at, theme, expected_dance_count, judges_save_available, duration_minutes, status, results_published_at, results_published_by"
      )
      .eq("season_id", activeSeasonId ?? "")
      .order("episode_number"),
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_finale, is_double_elimination_week")
      .eq("season_id", activeSeasonId ?? "")
      .order("week_number"),
    supabase
      .from("dance_scores")
      .select(danceScoreColumns(teamsMode, "id, episode_id, couple_id, dance_style_id, song_title, total_score, created_at", { teamId: true })),
    supabase.from("judge_scores").select("dance_score_id, judge_id, score"),
    supabase
      .from("episode_results")
      .select(
        "episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note"
      ),
    supabase.from("episode_participants").select("episode_id, couple_id"),
    supabase.from("episode_round_types").select("episode_id, round_types(name)"),
    supabase.from("episode_guest_judges").select("episode_id, judge_id"),
    supabase.from("episode_in_jeopardy_couples").select("episode_id, couple_id"),
    // Not season-scoped at the query level (draft_couple_releases has no
    // season_id column) -- the table only ever holds rows for currently-
    // unpublished episodes anyway (deleteAllDraftRows clears it on publish),
    // so it stays small; filtered to this season's episode ids below.
    admin.from("draft_couple_releases").select("episode_id, couple_id"),
    admin.from("draft_special_releases").select("episode_id, team_id"),
  ]);

  const flatten = (rows: typeof activeCouplesRaw) =>
    (rows ?? [])
      .map((c) => ({
        id: c.id,
        celebrity_name: c.celebrity?.name ?? "Unknown",
        pro_name: c.pro?.name ?? "Unknown",
      }))
      .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  const activeCouples = flatten(activeCouplesRaw);
  const allCouples = flatten(allCouplesRaw);
  const allCouplesWithStatus = (allCouplesRaw ?? [])
    .map((c) => ({
      id: c.id,
      celebrity_name: c.celebrity?.name ?? "Unknown",
      pro_name: c.pro?.name ?? "Unknown",
      status: c.status,
      elimination_week: c.elimination_week,
    }))
    .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));

  // This is the one place either page needs the admin client instead of the
  // user's own, to read every scheduled episode's in-progress draft up front
  // (so the form can rehydrate immediately on episode selection instead of
  // round-tripping).
  const [draftEntries, teams] = await Promise.all([
    Promise.all((episodes ?? []).map(async (e) => [e.id, await loadDraftForEpisode(admin, e.id)] as const)),
    teamsMode === "none"
      ? Promise.resolve(EMPTY_TEAMS_LOAD("none"))
      : loadEpisodeTeams(supabase, admin, (episodes ?? []).map((e) => e.id), teamsMode),
  ]);
  const liveRows = ((danceScores ?? []) as unknown as ResultsPageData["danceScores"]).map((row) => ({
    ...row,
    team_id: row.team_id ?? null,
    max_score: row.max_score == null ? null : Number(row.max_score),
  }));
  const draftsByEpisode: Record<string, DraftState> = Object.fromEntries(draftEntries);

  const unpublishedEpisodeIds = new Set(
    (episodes ?? []).filter((e) => !e.results_published_at).map((e) => e.id)
  );
  const revealedByEpisode: Record<string, Record<string, string>> = {};
  const teamLiveByTeam: ResultsPageData["teamLiveByTeam"] = {};
  for (const row of liveRows) {
    if (row.team_id) {
      const live = (teamLiveByTeam[row.team_id] ??= { total: Number(row.total_score), coupleIds: [], totalByCouple: {} });
      live.coupleIds.push(row.couple_id);
      live.totalByCouple[row.couple_id] = Number(row.total_score);
      continue;
    }
    if (!unpublishedEpisodeIds.has(row.episode_id)) continue;
    const byCouple = (revealedByEpisode[row.episode_id] ??= {});
    if (!byCouple[row.couple_id] || row.created_at > byCouple[row.couple_id]) byCouple[row.couple_id] = row.created_at;
  }

  const publisherIds = [
    ...new Set((episodes ?? []).map((e) => e.results_published_by).filter((id): id is string => !!id)),
  ];
  const { data: publisherProfiles } =
    publisherIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", publisherIds)
      : { data: [] };
  const publishedByNames = Object.fromEntries((publisherProfiles ?? []).map((p) => [p.id, p.display_name]));

  const participantsByEpisode: Record<string, string[]> = {};
  for (const p of episodeParticipants ?? []) {
    (participantsByEpisode[p.episode_id] ??= []).push(p.couple_id);
  }

  const roundTypesByEpisode: Record<string, string[]> = {};
  for (const row of episodeRoundTypes ?? []) {
    const joined = row.round_types;
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    if (!name) continue;
    (roundTypesByEpisode[row.episode_id] ??= []).push(name);
  }
  for (const names of Object.values(roundTypesByEpisode)) {
    names.sort((a, b) => a.localeCompare(b));
  }

  const guestJudgesByEpisode: Record<string, string[]> = {};
  for (const row of episodeGuestJudges ?? []) {
    (guestJudgesByEpisode[row.episode_id] ??= []).push(row.judge_id);
  }

  const inJeopardyByEpisode: Record<string, string[]> = {};
  for (const row of inJeopardyRows ?? []) {
    (inJeopardyByEpisode[row.episode_id] ??= []).push(row.couple_id);
  }

  const seasonEpisodeIds = new Set((episodes ?? []).map((e) => e.id));
  const releasedCoupleIdsByEpisode: Record<string, string[]> = {};
  for (const row of draftReleases ?? []) {
    if (!seasonEpisodeIds.has(row.episode_id)) continue;
    (releasedCoupleIdsByEpisode[row.episode_id] ??= []).push(row.couple_id);
  }
  const releasedTeamIdsByEpisode: Record<string, string[]> = {};
  for (const row of specialReleases ?? []) {
    if (!seasonEpisodeIds.has(row.episode_id)) continue;
    (releasedTeamIdsByEpisode[row.episode_id] ??= []).push(row.team_id);
  }

  return {
    activeCouples,
    allCouples,
    allCouplesWithStatus,
    judges,
    danceStyles,
    roundTypes,
    episodes: episodes ?? [],
    weeks: weeks ?? [],
    danceScores: liveRows,
    judgeScores: judgeScores ?? [],
    episodeResults: episodeResults ?? [],
    draftsByEpisode,
    revealedByEpisode,
    teamsMode: teams.mode,
    teamsByEpisode: teams.teamsByEpisode,
    teamMarksByTeam: teams.marksByTeam,
    teamScoresByTeam: teams.scoresByTeam,
    teamLiveByTeam,
    releasedCoupleIdsByEpisode,
    releasedTeamIdsByEpisode,
    publishedByNames,
    season,
    participantsByEpisode,
    roundTypesByEpisode,
    guestJudgesByEpisode,
    inJeopardyByEpisode,
  };
}
