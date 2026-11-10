import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { danceCardRule, danceCardWeekEpisodeIds, usesDanceCardLedger } from "@/lib/dance-card-v2";
import { buildCoupleHistory, unwatchedRange, type CoupleHistory, type CoupleHistoryWeekInput } from "@/lib/couple-history";
import { buildCoupleLeagueRows, coupleWeekPickNotes, type CoupleLeagueRow } from "@/lib/couple-leagues";
import { loadCoupleWeekResults } from "@/lib/couples-leaderboard-data";
import { formatManagerName } from "@/lib/manager-display";
import { scoringSettingsFromRow } from "@/lib/scoring";
import { danceMaxScore, danceScoreColumns, loadSpecialDanceLabels } from "@/lib/episode-teams";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import { liveRefreshWindows, toBannerWeeks, type RefreshWindow } from "@/lib/episode-banner";
import { loadGuestSeason } from "@/lib/guest-season-data";
import { teamDanceEpisodeIds } from "@/lib/night-dance-lines";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";
import { loadActiveSeasonId, loadAllCouples, loadTeamsMode, loadViewerMemberships, loadViewerSeason } from "@/lib/viewer-season-data";

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
  // A night's live state, as Results has it: refresh while the shown week is
  // posting or an episode night is on, and name a posting week the viewer
  // hasn't opted into (Stay Updated lives on Results).
  live: { refresh: boolean; windows: RefreshWindow[]; postingWeek: number | null };
  // Signed-in viewers' leagues with a finished draft (In Your Leagues).
  leagues: CoupleLeagueRow[];
  // Results' gold pick lines for each shown results week, by week number.
  pickNotes: Record<number, string[]>;
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

// The viewer's stake in the couple across their leagues. Rows: each league
// whose Dance Card has drafted, who holds the couple and its judges' points
// there, over the same weeks the page shows (Standings also folds in released
// drafts on a draft night; this page never shows drafts, so the two can
// differ until that week posts). Pick notes: each shown results week's
// Curtain Call and Grand Finale lines, as Results words them.
async function loadCoupleLeagues({
  supabase,
  viewerId,
  coupleId,
  weeks,
  resultWeeks,
  couples,
  cutoffWeek,
  finaleWeekNumber,
}: {
  supabase: SupabaseClient<Database>;
  viewerId: string;
  coupleId: string;
  weeks: CoupleHistoryWeekInput[];
  resultWeeks: { id: string; weekNumber: number }[];
  // The season's cast with true statuses; clamped here per use.
  couples: { id: string; celebrity_name: string; status: string; elimination_week: number | null }[];
  cutoffWeek: number | null;
  finaleWeekNumber: number | null;
}): Promise<Pick<CoupleHistoryPage, "leagues" | "pickNotes">> {
  const memberships = await loadViewerMemberships(supabase, viewerId);
  const leagueIds = memberships.flatMap((m) => (m.leagues ? [m.leagues.id] : []));
  if (leagueIds.length === 0) return { leagues: [], pickNotes: {} };
  // Team-scoped rows are keyed to the primary's user id, also for a co-manager.
  const teamIdByLeague = new Map(memberships.flatMap((m) => (m.leagues ? [[m.leagues.id, m.user_id] as const] : [])));
  const ownTeamRow = (row: { league_id: string; manager_id: string }) => teamIdByLeague.get(row.league_id) === row.manager_id;
  const teamIds = [...new Set(teamIdByLeague.values())];
  const [{ data: leagues }, { data: settings }, { data: slots }, { data: members }, weekResults, { data: predictions }, { data: grandFinaleRows }] = await Promise.all([
    supabase.from("leagues").select("id, draft_status, roster_size").in("id", leagueIds),
    supabase
      .from("scoring_settings")
      .select(
        "league_id, dance_card_version, judges_score_category_enabled, judges_score_starts_week, judges_score_category_weight, judges_score_multiplier, survival_points, elimination_prediction_points, top_scorer_prediction_points, first_place_points, second_place_points, third_place_points, fourth_place_points, fifth_place_points, curtain_call_near_miss_enabled"
      )
      .in("league_id", leagueIds),
    supabase.from("roster_slots").select("league_id, manager_id, couple_id, start_week, end_week").in("league_id", leagueIds),
    supabase
      .from("league_members")
      .select("league_id, user_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)")
      .in("league_id", leagueIds),
    loadCoupleWeekResults(supabase, weeks.map((week) => ({ week_number: week.weekNumber, episodeIds: week.episodeIds }))),
    resultWeeks.length > 0
      ? supabase
          .from("predictions")
          .select("league_id, manager_id, week_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
          .in("league_id", leagueIds)
          .in("manager_id", teamIds)
          .in("week_id", resultWeeks.map((week) => week.id))
      : Promise.resolve({ data: [] }),
    resultWeeks.length > 0
      ? supabase
          .from("grand_finale_predictions")
          .select("league_id, manager_id, couple_id, predicted_position")
          .in("league_id", leagueIds)
          .in("manager_id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);
  const drafted = new Set((leagues ?? []).filter((l) => l.draft_status === "completed").map((l) => l.id));
  const settingsByLeague = new Map((settings ?? []).map((s) => [s.league_id, s]));
  const rosterSizeByLeague = new Map((leagues ?? []).map((l) => [l.id, l.roster_size]));

  const weekNumberById = new Map(resultWeeks.map((week) => [week.id, week.weekNumber]));
  const picks = (predictions ?? []).filter(ownTeamRow).flatMap((row) => {
    const weekNumber = weekNumberById.get(row.week_id);
    if (weekNumber === undefined) return [];
    return [
      {
        leagueId: row.league_id,
        weekNumber,
        eliminatedIds: [row.predicted_eliminated_couple_id, row.predicted_eliminated_couple_id_2].filter((id): id is string => !!id),
        topScorerId: row.predicted_top_scorer_couple_id,
      },
    ];
  });
  const grandFinaleOrders = new Map<string, string[]>();
  for (const row of [...(grandFinaleRows ?? [])].filter(ownTeamRow).sort((a, b) => a.predicted_position - b.predicted_position)) {
    grandFinaleOrders.set(row.league_id, [...(grandFinaleOrders.get(row.league_id) ?? []), row.couple_id]);
  }
  const leagueNames = new Map(memberships.flatMap((m) => (m.leagues ? [[m.leagues.id, m.leagues.name] as const] : [])));
  const pickNotes = Object.fromEntries(
    resultWeeks.map((week) => [
      week.weekNumber,
      coupleWeekPickNotes({ coupleId, weekNumber: week.weekNumber, finaleWeekNumber, leagueNames, picks, grandFinaleOrders, couples }),
    ])
  );

  // A v2/v3 credit covers the whole week, so those leagues read a week still
  // posting with its published sibling nights; v1 leagues keep the shown weeks.
  const danceCardWeeks = (settings ?? []).some((setting) => usesDanceCardLedger(setting.dance_card_version))
    ? await loadViewerSeason(supabase, viewerId).then(({ weekRows, episodeRows }) =>
        loadCoupleWeekResults(
          supabase,
          weeks.map((week) => {
            const weekId = weekRows.find((row) => row.week_number === week.weekNumber)?.id;
            return {
              week_number: week.weekNumber,
              episodeIds: danceCardWeekEpisodeIds(week.episodeIds, episodeRows.filter((episode) => episode.week_id === weekId)),
            };
          })
        )
      )
    : null;

  const rows = buildCoupleLeagueRows({
    coupleId,
    weeks: weekResults,
    couples: couples.map((c) => ({
      ...c,
      status: spoilerSafeCoupleStatus({ status: c.status, eliminationWeek: c.elimination_week }, cutoffWeek, finaleWeekNumber),
    })),
    leagues: memberships.flatMap((m) => {
      const setting = m.leagues ? settingsByLeague.get(m.leagues.id) : undefined;
      if (!m.leagues || !setting || !drafted.has(m.leagues.id) || setting.judges_score_category_enabled === false) return [];
      const leagueId = m.leagues.id;
      return [
        {
          id: leagueId,
          name: m.leagues.name,
          myTeamId: m.user_id,
          managerNames: new Map(
            (members ?? [])
              .filter((member) => member.league_id === leagueId)
              .map((member) => [
                member.user_id,
                formatManagerName({ displayName: member.profiles?.display_name ?? "Unknown", coManagerDisplayName: member.co_manager?.display_name }),
              ])
          ),
          scoring: scoringSettingsFromRow(setting),
          rule: danceCardRule(setting, rosterSizeByLeague.get(setting.league_id) ?? 0),
          danceCardWeeks: usesDanceCardLedger(setting.dance_card_version) ? (danceCardWeeks ?? undefined) : undefined,
          anchorWeek: setting.judges_score_starts_week,
          categoryWeight: setting.judges_score_category_weight,
          slots: (slots ?? []).flatMap((slot) =>
            slot.league_id === leagueId && slot.couple_id
              ? [{ managerId: slot.manager_id, coupleId: slot.couple_id, startWeek: slot.start_week, endWeek: slot.end_week }]
              : []
          ),
        },
      ];
    }),
  });
  return { leagues: rows, pickNotes };
}

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
  const resultWeeks: { id: string; weekNumber: number }[] = [];
  let cutoffWeek: number | null;
  let unwatched: { from: number; to: number } | null = null;
  let finaleWeekNumber: number | null;
  let live: CoupleHistoryPage["live"] = { refresh: false, windows: [], postingWeek: null };

  if (viewer) {
    const season = await loadViewerSeason(supabase, viewer.id);
    const groupedWeeks = groupEpisodesByWeek(season.weekRows, season.episodeRows);
    const completedWeeks = groupedWeeks.filter((week) => week.status === "completed").sort((a, b) => b.week_number - a.week_number);
    const cutoffPending = resolveSpoilerCutoff(supabase, viewer.id, season.seasonId, viewer.spoilerFreeMode, completedWeeks);
    const [cutoff, { revealing, visible }] = await Promise.all([cutoffPending, loadRevealingWeek(supabase, groupedWeeks, cutoffPending)]);
    for (const week of cutoff.visibleEpisodes) {
      weeks.push({ weekNumber: week.week_number, theme: week.theme, episodeIds: week.episodes.map((e) => e.id), mode: "results" });
      resultWeeks.push({ id: week.id, weekNumber: week.week_number });
    }
    if (revealing && visible) {
      weeks.push({ weekNumber: revealing.week.week_number, theme: revealing.week.theme, episodeIds: revealing.episodeIds, mode: "scores" });
    }
    cutoffWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;
    if (cutoff.pendingRevealEpisode) unwatched = unwatchedRange(cutoff.lastWatchedWeek ?? 0, completedWeeks[0]?.week_number ?? null);
    finaleWeekNumber = groupedWeeks.find((week) => week.is_finale)?.week_number ?? null;
    live = {
      refresh: !!revealing && visible,
      windows: liveRefreshWindows(toBannerWeeks(groupedWeeks)),
      postingWeek: revealing && !visible ? revealing.week.week_number : null,
    };
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
  const leaguesPending = viewer
    ? loadCoupleLeagues({
        supabase,
        viewerId: viewer.id,
        coupleId,
        weeks,
        resultWeeks,
        couples: couples
          .filter((c) => c.season_id === seasonId)
          .map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "Unknown", status: c.status, elimination_week: c.elimination_week })),
        cutoffWeek,
        finaleWeekNumber,
      })
    : Promise.resolve({ leagues: [], pickNotes: {} });
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
    live,
    ...(await leaguesPending),
  };
}
