import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadResultsTaxonomy } from "@/lib/results";
import { loadDraftForEpisode, type DraftState } from "@/lib/results-draft";
import type { ScoringJudge } from "@/lib/scoring-judges";

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
  danceScores: { id: string; episode_id: string; couple_id: string; dance_style_id: string; total_score: number }[];
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
  inJeopardyByEpisode: Record<string, string[]>;
};

// Shared by /admin/results (By Week / By Couple / Enter Results) and
// /admin/schedule — both need the same season's episodes/weeks/drafts/roster,
// just render different subsets of it, so the query shape can't drift
// between the two pages. `admin` is the service-role client, needed only for
// reading draft rows (draft_* tables grant nothing to authenticated).
export async function loadResultsPageData(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>
): Promise<ResultsPageData> {
  const { data: activeSeasonId } = await supabase.rpc("active_season_id");

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
    { data: inJeopardyRows },
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
        "id, episode_number, week_id, airs_at, theme, expected_dance_count, duration_minutes, status, results_published_at, results_published_by"
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
      .select("id, episode_id, couple_id, dance_style_id, total_score"),
    supabase.from("judge_scores").select("dance_score_id, judge_id, score"),
    supabase
      .from("episode_results")
      .select(
        "episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note"
      ),
    supabase.from("episode_participants").select("episode_id, couple_id"),
    supabase.from("episode_round_types").select("episode_id, round_types(name)"),
    supabase.from("episode_in_jeopardy_couples").select("episode_id, couple_id"),
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
  const draftEntries = await Promise.all(
    (episodes ?? []).map(async (e) => [e.id, await loadDraftForEpisode(admin, e.id)] as const)
  );
  const draftsByEpisode: Record<string, DraftState> = Object.fromEntries(draftEntries);

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

  const inJeopardyByEpisode: Record<string, string[]> = {};
  for (const row of inJeopardyRows ?? []) {
    (inJeopardyByEpisode[row.episode_id] ??= []).push(row.couple_id);
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
    danceScores: danceScores ?? [],
    judgeScores: judgeScores ?? [],
    episodeResults: episodeResults ?? [],
    draftsByEpisode,
    publishedByNames,
    season,
    participantsByEpisode,
    roundTypesByEpisode,
    inJeopardyByEpisode,
  };
}
