import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getAuthUser } from "@/lib/supabase/server";
import { findOwnMembership, isOwnMembership } from "@/lib/acting-manager";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { groupEpisodesByWeek, liveCompetitionWeek } from "@/lib/competition-week";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { loadDraftScoreContext } from "@/lib/draft-scores-data";
import { loadDanceCardHistory } from "@/lib/dance-card-history-data";
import { danceCardRule, danceCardWeekEpisodeIds } from "@/lib/dance-card-v2";
import { draftManagerScoresForNight, draftNightDanceScores, homeStripChoice, scoresReplacingDraftWeek } from "@/lib/draft-scores";
import { formatManagerName } from "@/lib/manager-display";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { loadAllCouples, loadTeamsMode, loadViewerMemberships, loadViewerSeason } from "@/lib/viewer-season-data";
import { buildLiveAirChrome } from "@/lib/spoiler-free-strip-state";
import { toBannerWeeks } from "@/lib/episode-banner";
import { isSpoilerSafeActive, spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";
import { loadWeeklyStandings } from "@/lib/weekly-standings";

export type LeaguePageBase = Awaited<ReturnType<typeof loadLeaguePageBase>>;

// Picks and Standings are separate routes; this is everything both need
// (standings, spoiler cutoff, revealing/draft weeks, the league header), so
// each page only adds its own queries on top and the two can't drift.
export async function loadLeaguePageBase(supabase: SupabaseClient<Database>, id: string) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const draftContextPending = loadDraftScoreContext(supabase, user.id);
  const [
    { data: league },
    { data: scoringSettings },
    { data: members },
    allScores,
    allCouples,
    accountSettingsData,
    season,
    myMemberships,
  ] = await Promise.all([
    supabase.from("leagues").select("*").eq("id", id).single(),
    supabase.from("scoring_settings").select("*").eq("league_id", id).single(),
    supabase
      .from("league_members")
      .select(
        "user_id, role, joined_at, draft_position, draft_autopilot, co_manager_id, profiles!league_members_user_id_fkey(display_name), co_manager:profiles!league_members_co_manager_id_fkey(display_name)"
      )
      .eq("league_id", id)
      .order("joined_at"),
    loadWeeklyStandings(supabase, id),
    loadAllCouples(supabase),
    getAccountSettingsData(supabase, user.id),
    loadViewerSeason(supabase, user.id),
    loadViewerMemberships(supabase, user.id),
  ]);

  if (!league) {
    notFound();
  }

  const danceCardOn = scoringSettings?.judges_score_category_enabled ?? true;
  const waiversOn = league.waiver_mode === "waivers";
  const tradesOn = league.trades_enabled;
  const curtainCallOn = scoringSettings?.eliminations_category_enabled ?? true;
  const grandFinaleOn = scoringSettings?.bonus_picks_category_enabled ?? false;

  // A co-manager's auth uid never appears as a team-scoped manager_id (those
  // stay keyed to the primary's user_id) — every "my team's row" lookup
  // below resolves through myTeamId instead of the raw viewer id.
  const myTeamId = findOwnMembership(members ?? [], user.id)?.user_id ?? user.id;
  const isCommissioner = (members ?? []).some((m) => isOwnMembership(m, user.id) && m.role === "commissioner");

  // Everyone's current roster is public once the draft is done — the standings
  // are read through who holds which couples.
  const showLeagueRosters = danceCardOn && league.draft_status === "completed";
  // Also feeds the draft-night manager scores, so it loads whenever the league
  // has a roster, not only when the roster cards show.
  const allLeagueSlotsPending = supabase
    .from("roster_slots")
    .select("slot_number, manager_id, couple_id, start_week, end_week, source")
    .eq("league_id", id)
    .order("slot_number");
  const groupedWeeks = groupEpisodesByWeek(season.weekRows, season.episodeRows);
  const liveWeek = liveCompetitionWeek(groupedWeeks);
  const upcomingEpisode = liveWeek
    ? {
        id: liveWeek.id,
        week_number: liveWeek.week_number,
        theme: liveWeek.theme,
        is_double_elimination_week: liveWeek.is_double_elimination_week,
        is_finale: liveWeek.is_finale,
        nightsLabel: liveWeek.nightsLabel,
        episodeIds: liveWeek.episodes.map((episode) => episode.id),
      }
    : null;
  const completedEpisodes = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number)
    .map((week) => ({
      id: week.id,
      week_number: week.week_number,
      theme: week.theme,
      is_double_elimination_week: week.is_double_elimination_week,
      is_finale: week.is_finale,
      nightsLabel: week.nightsLabel,
      results_published_at:
        week.episodes
          .map((episode) => episode.results_published_at)
          .filter((value): value is string => !!value)
          .sort()
          .at(-1) ?? null,
      episodeIds: week.episodes.map((episode) => episode.id),
    }));
  const finaleWeekNumber = groupedWeeks.find((week) => week.is_finale)?.week_number ?? null;

  const cutoffPending = resolveSpoilerCutoff(
    supabase,
    user.id,
    season.seasonId,
    accountSettingsData.spoilerFreeMode,
    completedEpisodes ?? []
  );
  const [cutoff, { revealing, scoredIds, visible: revealingVisible }, draftContext, { data: allLeagueSlots }, teamsMode] =
    await Promise.all([
      cutoffPending,
      loadRevealingWeek(supabase, groupedWeeks, cutoffPending),
      draftContextPending,
      allLeagueSlotsPending,
      loadTeamsMode(supabase),
    ]);
  const draftNight = draftContext.night;
  const { strip: spoilerFreeStrip, prompt: livePrompt, refreshWindows } = buildLiveAirChrome({
    spoilerFreeMode: accountSettingsData.spoilerFreeMode,
    lastWatchedWeek: cutoff.lastWatchedWeek ?? 0,
    completedWeekNumbers: groupedWeeks.filter((week) => week.status === "completed").map((week) => week.week_number),
    revealingWeekNumber: revealing?.week.week_number ?? null,
    pendingRevealWeekNumber: cutoff.pendingRevealEpisode?.week_number ?? null,
    draftContext,
    bannerWeeks: toBannerWeeks(groupedWeeks),
  });
  const danceCard = scoringSettings ? danceCardRule(scoringSettings, league.roster_size) : null;
  const draftHistory =
    draftNight && danceCard && danceCard.version !== "v1" && season.seasonId
      ? await loadDanceCardHistory(supabase, season.seasonId, draftNight.weekNumber + 1)
      : null;
  const draftManagers =
    draftNight && scoringSettings
      ? draftManagerScoresForNight(
          scoringSettings,
          allLeagueSlots ?? [],
          {
            weekNumber: draftNight.weekNumber,
            danceScores: draftNightDanceScores(draftNight),
          },
          danceCard && danceCard.version !== "v1" && draftHistory
            ? {
                rule: danceCard,
                priorWeeks: draftHistory,
                weekOutcomes: draftHistory.find((w) => w.weekNumber === draftNight.weekNumber)?.outcomes ?? [],
              }
            : undefined
        )
      : [];
  const scoreRows =
    draftNight && draftManagers.length > 0
      ? scoresReplacingDraftWeek(allScores, draftNight.weekId, draftManagers, scoringSettings ?? undefined)
      : allScores;

  const pointsByManager = new Map<string, number>();
  const rosterPointsByManager = new Map<string, number>();
  // Lifeline and trade transfers: Dance Card points that arrive already
  // weighted, outside roster_points.
  const storedDanceCardPointsByManager = new Map<string, number>();
  const predictionPointsByManager = new Map<string, number>();
  const grandFinalePointsByManager = new Map<string, number>();
  const scoresByEpisode: Record<
    string,
    { managerId: string; rosterPoints: number; predictionPoints: number; grandFinalePoints: number; totalPoints: number }[]
  > = {};
  for (const row of scoreRows) {
    if (!scoredIds.has(row.week_id) && row.week_id !== draftNight?.weekId) continue;
    pointsByManager.set(row.manager_id, (pointsByManager.get(row.manager_id) ?? 0) + row.total_points);
    rosterPointsByManager.set(row.manager_id, (rosterPointsByManager.get(row.manager_id) ?? 0) + row.roster_points);
    storedDanceCardPointsByManager.set(
      row.manager_id,
      (storedDanceCardPointsByManager.get(row.manager_id) ?? 0) + (row.lifeline_points ?? 0) + (row.transfer_points ?? 0)
    );
    predictionPointsByManager.set(
      row.manager_id,
      (predictionPointsByManager.get(row.manager_id) ?? 0) + row.prediction_points
    );
    grandFinalePointsByManager.set(
      row.manager_id,
      (grandFinalePointsByManager.get(row.manager_id) ?? 0) + row.grand_finale_points
    );
    (scoresByEpisode[row.week_id] ??= []).push({
      managerId: row.manager_id,
      rosterPoints: row.roster_points,
      predictionPoints: row.prediction_points,
      grandFinalePoints: row.grand_finale_points,
      totalPoints: row.total_points,
    });
  }

  const standings = (members ?? []).map((m) => ({
    managerId: m.user_id,
    displayName: formatManagerName({
      displayName: m.profiles?.display_name ?? "Unknown",
      coManagerDisplayName: m.co_manager?.display_name,
    }),
    totalPoints: pointsByManager.get(m.user_id) ?? 0,
  }));

  const latestCompletedWeekId = cutoff.effectiveLatestEpisode?.id ?? null;
  const latestCompletedWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;

  const nameByManager = Object.fromEntries(
    (members ?? []).map((m) => [
      m.user_id,
      formatManagerName({ displayName: m.profiles?.display_name ?? "Unknown", coManagerDisplayName: m.co_manager?.display_name }),
    ])
  );

  const rank = Math.max(
    1,
    [...standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex((s) => s.managerId === myTeamId) + 1
  );

  const flatCouples = allCouples.map((c) => ({
    id: c.id,
    status: c.status,
    season_id: c.season_id,
    elimination_week: c.elimination_week,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));

  const activeCouples = flatCouples.filter(
    (c) =>
      c.season_id === season.seasonId &&
      isSpoilerSafeActive(
        { status: c.status, eliminationWeek: c.elimination_week },
        latestCompletedWeek,
        finaleWeekNumber
      )
  );
  const seasonCouples = flatCouples.filter((c) => c.season_id === season.seasonId);
  // Grand Finale needs every season couple (to rank them), with status
  // spoiler-clamped. Pick 'Em / Recast availability use isSpoilerSafeActive
  // so a revealed elim is gone and an unrevealed one still looks competing.
  const seasonCouplesSpoilerSafe = seasonCouples.map((c) => ({
    ...c,
    status: spoilerSafeCoupleStatus(
      { status: c.status, eliminationWeek: c.elimination_week },
      latestCompletedWeek,
      finaleWeekNumber
    ),
  }));
  // Historical lookups (roster, revealed predictions) span every couple this
  // league has ever touched; the Pick 'Em picker is scoped to just the couples
  // actually offered, so collisions are checked against that pool specifically.
  const allDisplayNames = buildCoupleDisplayNames(flatCouples);
  const activeDisplayNames = buildCoupleDisplayNames(activeCouples);

  // Every held slot, with its number: Recast reads the viewer's current seats
  // from this even when the league's roster cards are hidden.
  const rosterSlotPeriods = (allLeagueSlots ?? [])
    .filter((r): r is typeof r & { couple_id: string } => !!r.couple_id)
    .map((r) => ({
      slotNumber: r.slot_number,
      managerId: r.manager_id,
      coupleId: r.couple_id,
      startWeek: r.start_week,
      endWeek: r.end_week,
      source: r.source,
    }));
  const leagueSlotPeriods = showLeagueRosters ? rosterSlotPeriods : [];

  // Flipping model shared with Curtain Call: visible completed weeks only,
  // latest by default. With none yet, roster views show who holds what now,
  // with no points.
  const revealingDanceWeek =
    revealing && revealingVisible
      ? [
          {
            id: revealing.week.id,
            week_number: revealing.week.week_number,
            theme: revealing.week.theme,
            is_double_elimination_week: revealing.week.is_double_elimination_week,
            nightsLabel: revealing.week.nightsLabel,
            results_published_at: null,
            episodeIds: revealing.episodeIds,
          },
        ]
      : [];
  const draftDanceWeek =
    draftNight && draftNight.dances.length > 0 && !revealingDanceWeek.some((week) => week.id === draftNight.weekId) && !completedEpisodes.some((week) => week.id === draftNight.weekId)
      ? groupedWeeks
          .filter((week) => week.id === draftNight.weekId)
          .map((week) => ({
            id: week.id,
            week_number: week.week_number,
            theme: week.theme,
            is_double_elimination_week: week.is_double_elimination_week,
            nightsLabel: week.nightsLabel,
            results_published_at: null,
            episodeIds: draftNight.episodeIds,
          }))
      : [];
  const visibleDanceWeeks = [
    ...completedEpisodes.filter((w) => cutoff.allowedEpisodeIds.has(w.id)),
    ...revealingDanceWeek,
    ...draftDanceWeek,
  ].sort((a, b) => a.week_number - b.week_number);
  // A v2 credit covers the whole week, so a week still posting also counts
  // its already-published sibling nights (dances and settled bonuses) as
  // Dance Card input; which nights are displayed stays as above.
  const danceCardInputWeeks = visibleDanceWeeks.map((week) => ({
    ...week,
    episodeIds: danceCardWeekEpisodeIds(week.episodeIds, groupedWeeks.find((w) => w.id === week.id)?.episodes ?? []),
  }));

  // Other leagues' rank and Picks Due load when the switcher opens
  // (getSwitcherSummaries), not on every render and refresh.
  const switcherLeagues = [
    { id, name: league.name },
    ...myMemberships.flatMap((m) => (m.leagues && m.leagues.id !== id ? [{ id: m.leagues.id, name: m.leagues.name }] : [])),
  ];

  return {
    user,
    league,
    scoringSettings,
    danceCardRule: danceCard ?? ({ version: "v1" } as const),
    danceCardOn,
    waiversOn,
    tradesOn,
    curtainCallOn,
    grandFinaleOn,
    members,
    myTeamId,
    isCommissioner,
    accountSettingsData,
    groupedWeeks,
    upcomingEpisode,
    completedEpisodes,
    finaleWeekNumber,
    cutoff,
    revealing,
    scoredIds,
    revealingVisible,
    draftNight,
    draftManagers,
    spoilerFreeStrip,
    draftScoresStrip: homeStripChoice(!!draftNight, !!spoilerFreeStrip) === "draft",
    livePrompt,
    refreshWindows,
    scoreRows,
    pointsByManager,
    rosterPointsByManager,
    storedDanceCardPointsByManager,
    predictionPointsByManager,
    grandFinalePointsByManager,
    standings,
    latestCompletedWeekId,
    latestCompletedWeek,
    nameByManager,
    rank,
    flatCouples,
    activeCouples,
    seasonCouples,
    seasonCouplesSpoilerSafe,
    allDisplayNames,
    activeDisplayNames,
    showLeagueRosters,
    leagueSlotPeriods,
    rosterSlotPeriods,
    visibleDanceWeeks,
    danceCardInputWeeks,
    teamsMode,
    switcherLeagues,
    switcherCurrent: { rank, totalMembers: standings.length },
  };
}
