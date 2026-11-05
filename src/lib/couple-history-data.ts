import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildCoupleHistory, unwatchedRange, type CoupleHistory, type CoupleHistoryWeekInput } from "@/lib/couple-history";
import { danceMaxScore, danceScoreColumns, loadSpecialDanceLabels } from "@/lib/episode-teams";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { loadGuestSeason } from "@/lib/guest-season-data";
import { teamDanceEpisodeIds } from "@/lib/night-dance-lines";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";
import { loadActiveSeasonId, loadAllCouples, loadTeamsMode, loadViewerSeason } from "@/lib/viewer-season-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CoupleHistoryPage = {
  celebrity: string;
  pro: string;
  // Clamped to what the viewer has watched (spoilerSafeCoupleStatus).
  status: string;
  eliminationWeek: number | null;
  history: CoupleHistory;
  // Completed weeks a Spoiler-Free viewer hasn't marked watched.
  unwatched: { from: number; to: number } | null;
};

type DanceRow = {
  id: string;
  episode_id: string;
  couple_id: string;
  song_title: string | null;
  total_score: number;
  scaled_score: number;
  max_score?: number | string | null;
  team_id?: string | null;
  dance_styles: { name: string } | null;
};

// "Carrie Ann Inaba" → "Carrie Ann", so a four-judge night fits one line.
function judgeShortName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words.slice(0, -1).join(" ") : name;
}

// One couple of the active season, as far as this viewer may see it. Every
// gate is worked out here for this viewer (the score, outcome and judge mark
// tables are readable by any signed-in user, so RLS would not catch a
// leak): completed weeks through the spoiler cutoff with their outcomes, plus
// a week still being revealed with its posted dances only once the viewer
// chose Stay Updated or Mark Watched for it. Guests get published weeks and
// no judge marks. Null for an unknown id or another season's couple.
export async function loadCoupleHistory(
  supabase: SupabaseClient<Database>,
  viewer: { id: string; spoilerFreeMode: boolean } | null,
  coupleId: string
): Promise<CoupleHistoryPage | null> {
  if (!UUID.test(coupleId)) return null;
  const [couples, seasonId] = await Promise.all([loadAllCouples(supabase), loadActiveSeasonId(supabase)]);
  const couple = couples.find((c) => c.id === coupleId);
  if (!couple || !seasonId || couple.season_id !== seasonId) return null;

  const weeks: CoupleHistoryWeekInput[] = [];
  let cutoffWeek: number | null;
  let unwatched: { from: number; to: number } | null = null;
  let finaleWeekNumber: number | null;

  if (viewer) {
    const season = await loadViewerSeason(supabase, viewer.id);
    const groupedWeeks = groupEpisodesByWeek(season.weekRows, season.episodeRows);
    const completedWeeks = groupedWeeks.filter((week) => week.status === "completed").sort((a, b) => b.week_number - a.week_number);
    const cutoffPending = resolveSpoilerCutoff(supabase, viewer.id, season.seasonId, viewer.spoilerFreeMode, completedWeeks);
    const [cutoff, { revealing, visible }] = await Promise.all([cutoffPending, loadRevealingWeek(supabase, groupedWeeks, cutoffPending)]);
    for (const week of cutoff.visibleEpisodes) {
      weeks.push({ weekNumber: week.week_number, theme: week.theme, episodeIds: week.episodes.map((e) => e.id), mode: "results" });
    }
    if (revealing && visible) {
      weeks.push({ weekNumber: revealing.week.week_number, theme: revealing.week.theme, episodeIds: revealing.episodeIds, mode: "scores" });
    }
    cutoffWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;
    if (cutoff.pendingRevealEpisode) unwatched = unwatchedRange(cutoff.lastWatchedWeek ?? 0, completedWeeks[0]?.week_number ?? null);
    finaleWeekNumber = groupedWeeks.find((week) => week.is_finale)?.week_number ?? null;
  } else {
    const { groupedWeeks, completedWeeks } = await loadGuestSeason(supabase);
    for (const week of completedWeeks) {
      weeks.push({ weekNumber: week.week_number, theme: week.theme, episodeIds: week.episodes.map((e) => e.id), mode: "results" });
    }
    cutoffWeek = completedWeeks.reduce<number | null>((top, week) => Math.max(top ?? 0, week.week_number), null);
    finaleWeekNumber = groupedWeeks.find((week) => week.is_finale)?.week_number ?? null;
  }

  const episodeIds = weeks.flatMap((week) => week.episodeIds);
  const resultEpisodeIds = weeks.filter((week) => week.mode === "results").flatMap((week) => week.episodeIds);
  const teamsMode = episodeIds.length > 0 ? await loadTeamsMode(supabase) : "none";
  const [{ data: danceRows }, { data: episodeRows }, { data: outcomes }, { data: jeopardyRows }, { data: roundTypeRows }, labels] = await Promise.all([
    episodeIds.length > 0
      ? supabase
          .from("dance_scores")
          .select(danceScoreColumns(teamsMode, "id, episode_id, couple_id, song_title, total_score, scaled_score, dance_styles(name)", { teamId: true }))
          .eq("couple_id", coupleId)
          .in("episode_id", episodeIds)
      : Promise.resolve({ data: [] }),
    episodeIds.length > 0
      ? supabase
          .from("dance_scores")
          .select(danceScoreColumns(teamsMode, "episode_id, couple_id, total_score, scaled_score", { teamId: true }))
          .in("episode_id", episodeIds)
      : Promise.resolve({ data: [] }),
    resultEpisodeIds.length > 0
      ? supabase.from("episode_results").select("episode_id, couple_id, outcome").eq("couple_id", coupleId).in("episode_id", resultEpisodeIds)
      : Promise.resolve({ data: [] as { episode_id: string; couple_id: string; outcome: string }[] }),
    resultEpisodeIds.length > 0
      ? supabase.from("episode_in_jeopardy_couples").select("episode_id").eq("couple_id", coupleId).in("episode_id", resultEpisodeIds)
      : Promise.resolve({ data: [] as { episode_id: string }[] }),
    // Guests can't read round types, so their Freestyle never reads "(Team)".
    viewer && episodeIds.length > 0
      ? supabase.from("episode_round_types").select("episode_id, round_types(name)").in("episode_id", episodeIds)
      : Promise.resolve({ data: [] }),
    loadSpecialDanceLabels(supabase, episodeIds, teamsMode),
  ]);

  const dances = (danceRows ?? []) as unknown as DanceRow[];
  // Judge marks are for signed-in viewers only (guests have no grant), and
  // read by the dance ids already gated above, never by couple or episode.
  const { data: markRows } =
    viewer && dances.length > 0
      ? await supabase.from("judge_scores").select("dance_score_id, score, people(name)").in("dance_score_id", dances.map((d) => d.id))
      : { data: [] as { dance_score_id: string; score: number; people: { name: string } | null }[] };

  const history = buildCoupleHistory({
    coupleId,
    weeks,
    episodeDances: ((episodeRows ?? []) as unknown as Omit<DanceRow, "id" | "song_title" | "dance_styles">[]).map((row) => ({
      episodeId: row.episode_id,
      coupleId: row.couple_id,
      totalScore: Number(row.total_score),
      scaledScore: Number(row.scaled_score),
      maxScore: danceMaxScore(row),
      teamId: row.team_id ?? null,
    })),
    dances: dances.map((row) => ({
      id: row.id,
      episodeId: row.episode_id,
      coupleId: row.couple_id,
      style: row.dance_styles?.name ?? "Unknown dance",
      song: row.song_title,
      totalScore: Number(row.total_score),
      scaledScore: Number(row.scaled_score),
      maxScore: danceMaxScore(row),
      teamId: row.team_id ?? null,
    })),
    marks: (markRows ?? []).map((m) => ({ danceId: m.dance_score_id, judge: judgeShortName(m.people?.name ?? "Judge"), score: Number(m.score) })),
    outcomes: outcomes ?? [],
    inJeopardyEpisodeIds: new Set((jeopardyRows ?? []).map((row) => row.episode_id)),
    teamDanceEpisodes: teamDanceEpisodeIds(roundTypeRows ?? []),
    labels: new Map(Object.entries(labels)),
  });

  const status = spoilerSafeCoupleStatus({ status: couple.status, eliminationWeek: couple.elimination_week }, cutoffWeek, finaleWeekNumber);
  return {
    celebrity: couple.celebrity?.name ?? "Unknown",
    pro: couple.pro?.name ?? "Unknown",
    status,
    eliminationWeek: status === couple.status ? couple.elimination_week : null,
    history,
    unwatched,
  };
}
