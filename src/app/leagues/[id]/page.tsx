import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StandingsTable } from "@/components/standings-table";
import { StandingsModuleBreakdown } from "@/components/standings-module-breakdown";
import { RosterCard } from "@/components/roster-card";
import { CurtainCallCard } from "@/components/curtain-call-card";
import { PickEmBox } from "@/components/pick-em-box";
import { PastPicksRecap } from "@/components/past-picks-card";
import { GrandFinaleBox } from "@/components/grand-finale-box";
import { loadOtherLeaguePicks } from "@/lib/other-league-picks";
import { DraftStatusCard } from "@/components/draft-status-card";
import { RecastNudgeCard } from "@/components/recast-nudge-card";
import { computeLeagueHomeSummary } from "@/lib/league-home-summary";
import { LeagueHeader } from "@/components/league-header";
import { LeagueTabs } from "@/components/league-tabs";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { getStandingMessage } from "@/lib/standings-message";
import { managerIdForPick, type DraftType } from "@/lib/draft";
import { clampRosterCoupleForWeek } from "@/lib/roster-weekly-points";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { groupEpisodesByWeek, liveCompetitionWeek } from "@/lib/competition-week";
import { isSpoilerSafeActive, spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";
import { partitionRecastSlots } from "@/lib/recast-framing";
import { LeagueRostersCard } from "@/components/league-rosters-card";
import { scoringModule, type ScoringModuleKey } from "@/lib/scoring-modules";
import { EpisodeCarousel } from "@/components/episode-carousel";
import { adjacentThisWeekWeeks, rosterWeekHref } from "@/lib/this-week-carousel";
import { buildLeagueRosters, orderManagersForRosters } from "@/lib/league-rosters";
import { judgePointsThroughWeek, slotActiveInWeek } from "@/lib/roster-couple-points";
import {
  buildCurtainCallWeeks,
  buildPastPicksComparison,
  isPastPicksLocked,
  selectCurtainCallWeek,
} from "@/lib/past-picks";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; justCreated?: string; week?: string; rosterWeek?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { error, message, justCreated, week: weekParam, rosterWeek: rosterWeekParam, tab } = await searchParams;
  const activeTab = tab === "standings" ? "standings" : "picks";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: league } = await supabase.from("leagues").select("*").eq("id", id).single();

  if (!league) {
    notFound();
  }

  const { data: scoringSettings } = await supabase
    .from("scoring_settings")
    .select("*")
    .eq("league_id", id)
    .single();

  const danceCardOn = scoringSettings?.judges_score_category_enabled ?? true;
  const waiversOn = league.waiver_mode === "waivers";
  const curtainCallOn = scoringSettings?.eliminations_category_enabled ?? true;
  const grandFinaleOn = scoringSettings?.bonus_picks_category_enabled ?? false;
  const grandFinaleDeadline = grandFinaleOn
    ? (await supabase.rpc("effective_grand_finale_deadline", { p_league_id: id })).data ?? null
    : null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);
  // Section labels (🔮 Curtain Call / 🪩 Dance Card / 🏆 Grand Finale) only
  // earn their keep once there's more than one module on the page to tell
  // apart — a single-module league goes straight to its content.
  const showSectionLabels = [curtainCallOn, danceCardOn, grandFinaleOn].filter(Boolean).length >= 2;

  const [{ data: members }, { data: allScores }, { data: rosterSlots }, { data: allCouples }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("user_id, role, joined_at, draft_position, draft_autopilot, profiles(display_name)")
        .eq("league_id", id)
        .order("joined_at"),
      supabase
        .from("weekly_manager_scores")
        .select("week_id, manager_id, roster_points, prediction_points, grand_finale_points, total_points")
        .eq("league_id", id),
      supabase
        .from("roster_slots")
        .select(
          "slot_number, couple_id, couples(status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name))"
        )
        .eq("league_id", id)
        .eq("manager_id", user.id)
        .is("end_week", null),
      supabase
        .from("couples")
        .select(
          "id, status, season_id, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"
        ),
    ]);

  const isCommissioner = (members ?? []).some((m) => m.user_id === user.id && m.role === "commissioner");
  const accountSettingsData = await getAccountSettingsData(supabase, user.id);

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", activeSeasonId ?? "")
      .order("week_number", { ascending: true }),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, theme, status, results_published_at")
      .eq("season_id", activeSeasonId ?? ""),
  ]);
  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const liveWeek = liveCompetitionWeek(groupedWeeks);
  const upcomingEpisode = liveWeek
    ? {
        id: liveWeek.id,
        week_number: liveWeek.week_number,
        theme: liveWeek.theme,
        is_double_elimination_week: liveWeek.is_double_elimination_week,
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

  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    activeSeasonId ?? null,
    accountSettingsData.spoilerFreeMode,
    completedEpisodes ?? []
  );

  const pointsByManager = new Map<string, number>();
  const rosterPointsByManager = new Map<string, number>();
  const predictionPointsByManager = new Map<string, number>();
  const grandFinalePointsByManager = new Map<string, number>();
  const scoresByEpisode: Record<
    string,
    { managerId: string; rosterPoints: number; predictionPoints: number; grandFinalePoints: number; totalPoints: number }[]
  > = {};
  for (const row of allScores ?? []) {
    if (!cutoff.allowedEpisodeIds.has(row.week_id)) continue;
    pointsByManager.set(row.manager_id, (pointsByManager.get(row.manager_id) ?? 0) + row.total_points);
    rosterPointsByManager.set(row.manager_id, (rosterPointsByManager.get(row.manager_id) ?? 0) + row.roster_points);
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
    displayName: m.profiles?.display_name ?? "Unknown",
    totalPoints: pointsByManager.get(m.user_id) ?? 0,
  }));

  // Rank-change arrows compare current standings to what they'd have been
  // without the most recently completed week's scores — no historical
  // snapshot table needed, since weekly_manager_scores already carries points
  // per competition week.
  const latestCompletedWeekId = cutoff.effectiveLatestEpisode?.id ?? null;
  const latestCompletedWeek = cutoff.effectiveLatestEpisode?.week_number ?? null;
  const latestCompletedResultsPublishedAt = cutoff.effectiveLatestEpisode?.results_published_at ?? null;

  const previousPointsByManager = new Map<string, number>();
  if (latestCompletedWeekId) {
    for (const row of allScores ?? []) {
      if (!cutoff.allowedEpisodeIds.has(row.week_id)) continue;
      if (row.week_id === latestCompletedWeekId) continue;
      previousPointsByManager.set(
        row.manager_id,
        (previousPointsByManager.get(row.manager_id) ?? 0) + row.total_points
      );
    }
  }

  function ranksFromPoints(pointsMap: Map<string, number>): Map<string, number> {
    const ranked = (members ?? [])
      .map((m) => ({ managerId: m.user_id, points: pointsMap.get(m.user_id) ?? 0 }))
      .sort((a, b) => b.points - a.points);
    return new Map(ranked.map((r, i) => [r.managerId, i + 1]));
  }

  const currentRanks = ranksFromPoints(pointsByManager);
  const previousRanks = latestCompletedWeekId ? ranksFromPoints(previousPointsByManager) : null;

  const standingsWithChange = standings.map((s) => {
    if (!previousRanks) return { ...s, change: null as "up" | "down" | null };
    const curr = currentRanks.get(s.managerId)!;
    const prev = previousRanks.get(s.managerId)!;
    const change: "up" | "down" | null = curr < prev ? "up" : curr > prev ? "down" : null;
    return { ...s, change };
  });

  const moduleBreakdownMembers = [...standingsWithChange]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((s) => ({
      managerId: s.managerId,
      displayName: s.displayName,
      danceCard: danceCardOn
        ? Math.round(
            (rosterPointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.judges_score_category_weight ?? 1)
          )
        : null,
      curtainCall: curtainCallOn
        ? Math.round(
            (predictionPointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.eliminations_category_weight ?? 1)
          )
        : null,
      grandFinale: grandFinaleOn
        ? Math.round(
            (grandFinalePointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.bonus_picks_category_weight ?? 1)
          )
        : null,
    }));

  const nameByManager = Object.fromEntries(
    (members ?? []).map((m) => [m.user_id, m.profiles?.display_name ?? "Unknown"])
  );

  const rank = Math.max(
    1,
    [...standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex((s) => s.managerId === user.id) + 1
  );

  const userPoints = pointsByManager.get(user.id) ?? 0;
  const pointTotals = standings.map((s) => s.totalPoints);
  const maxPoints = Math.max(...pointTotals);
  const minPoints = Math.min(...pointTotals);
  const isTiedForFirst = userPoints === maxPoints && pointTotals.filter((p) => p === maxPoints).length > 1;
  const isTiedForLast =
    !isTiedForFirst && userPoints === minPoints && pointTotals.filter((p) => p === minPoints).length > 1;

  const standingMessage = getStandingMessage({
    rank,
    totalMembers: standings.length,
    isTiedForFirst,
    isTiedForLast,
    isPreSeason: (allScores ?? []).length === 0,
  });

  const flatCouples = (allCouples ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    season_id: c.season_id,
    elimination_week: c.elimination_week,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));

  const activeCouples = flatCouples.filter(
    (c) =>
      c.season_id === activeSeasonId &&
      isSpoilerSafeActive(
        { status: c.status, eliminationWeek: c.elimination_week },
        latestCompletedWeek,
        finaleWeekNumber
      )
  );
  const seasonCouples = flatCouples.filter((c) => c.season_id === activeSeasonId);
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

  let isLocked = false;
  let lockAt: string | null = null;
  let ownPrediction = null;
  let revealedPredictions:
    | {
        displayName: string;
        eliminatedLabel: string | null;
        eliminatedLabel2: string | null;
        topScorerLabel: string | null;
      }[]
    | undefined;

  if (upcomingEpisode && curtainCallOn) {
    const { data: computedLockAt } = await supabase.rpc("prediction_lock_at", {
      p_league_id: id,
      p_week_id: upcomingEpisode.id,
    });
    lockAt = computedLockAt;
    isLocked = !!lockAt && new Date() >= new Date(lockAt);

    const { data } = await supabase
      .from("predictions")
      .select("predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
      .eq("league_id", id)
      .eq("week_id", upcomingEpisode.id)
      .eq("manager_id", user.id)
      .maybeSingle();
    ownPrediction = data;

    if (isLocked) {
      const { data: allPredictions } = await supabase
        .from("predictions")
        .select(
          "manager_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id"
        )
        .eq("league_id", id)
        .eq("week_id", upcomingEpisode.id);

      revealedPredictions = (allPredictions ?? []).map((p) => {
        const eliminatedParts = p.predicted_eliminated_couple_id
          ? allDisplayNames.get(p.predicted_eliminated_couple_id)
          : undefined;
        const eliminatedParts2 = p.predicted_eliminated_couple_id_2
          ? allDisplayNames.get(p.predicted_eliminated_couple_id_2)
          : undefined;
        const topScorerParts = p.predicted_top_scorer_couple_id
          ? allDisplayNames.get(p.predicted_top_scorer_couple_id)
          : undefined;
        return {
          displayName: nameByManager[p.manager_id] ?? "Unknown",
          eliminatedLabel: eliminatedParts ? formatCoupleName(eliminatedParts) : null,
          eliminatedLabel2: eliminatedParts2 ? formatCoupleName(eliminatedParts2) : null,
          topScorerLabel: topScorerParts ? formatCoupleName(topScorerParts) : null,
        };
      });
    }
  }

  let grandFinaleOrder: string[] | null = null;
  if (grandFinaleOn) {
    const { data: ownGrandFinalePicks } = await supabase
      .from("grand_finale_predictions")
      .select("couple_id, predicted_position")
      .eq("league_id", id)
      .eq("manager_id", user.id)
      .order("predicted_position", { ascending: true });
    grandFinaleOrder = ownGrandFinalePicks && ownGrandFinalePicks.length > 0
      ? ownGrandFinalePicks.map((p) => p.couple_id)
      : null;
  }

  const otherLeaguePicks = await loadOtherLeaguePicks(supabase, {
    userId: user.id,
    currentLeagueId: id,
    curtainCallWeekId: curtainCallOn && upcomingEpisode && !isLocked ? upcomingEpisode.id : null,
    includeGrandFinale: grandFinaleOn && !grandFinaleLocked,
    now: new Date(),
  });

  const picksNeeded =
    (curtainCallOn && !!upcomingEpisode && !isLocked && !ownPrediction) ||
    (grandFinaleOn && !grandFinaleLocked && !grandFinaleOrder);

  const categoryBreakdown = (
    [
      curtainCallOn && {
        label: scoringModule("curtainCall").name,
        points: Math.round(
          (predictionPointsByManager.get(user.id) ?? 0) * (scoringSettings?.eliminations_category_weight ?? 1)
        ),
      },
      danceCardOn && {
        label: scoringModule("danceCard").name,
        points: Math.round(
          (rosterPointsByManager.get(user.id) ?? 0) * (scoringSettings?.judges_score_category_weight ?? 1)
        ),
      },
      grandFinaleOn && {
        label: scoringModule("grandFinale").name,
        points: Math.round(
          (grandFinalePointsByManager.get(user.id) ?? 0) * (scoringSettings?.bonus_picks_category_weight ?? 1)
        ),
      },
    ]
  ).filter((c) => c !== false);

  // Everyone's current roster is public once the draft is done — the standings
  // are read through who holds which couples.
  const showLeagueRosters = danceCardOn && league.draft_status === "completed";
  const { data: allLeagueSlots } = showLeagueRosters
    ? await supabase
        .from("roster_slots")
        .select("manager_id, couple_id, start_week, end_week")
        .eq("league_id", id)
        .order("slot_number")
    : { data: [] as { manager_id: string; couple_id: string | null; start_week: number; end_week: number | null }[] };
  const leagueSlotPeriods = (allLeagueSlots ?? [])
    .filter((r): r is typeof r & { couple_id: string } => !!r.couple_id)
    .map((r) => ({ managerId: r.manager_id, coupleId: r.couple_id, startWeek: r.start_week, endWeek: r.end_week }));

  // Flipping model shared with Curtain Call: visible completed weeks only,
  // latest by default. With none yet, roster views show who holds what now,
  // with no points.
  const visibleDanceWeeks = [...completedEpisodes]
    .filter((w) => cutoff.allowedEpisodeIds.has(w.id))
    .sort((a, b) => a.week_number - b.week_number);
  const latestVisibleDanceWeek = visibleDanceWeeks[visibleDanceWeeks.length - 1] ?? null;
  const yourRosterWeek =
    visibleDanceWeeks.find((w) => w.id === rosterWeekParam) ?? latestVisibleDanceWeek;

  const episodeWeekNumber = new Map<string, number>();
  for (const week of groupedWeeks) {
    if (!cutoff.allowedEpisodeIds.has(week.id)) continue;
    for (const episode of week.episodes) episodeWeekNumber.set(episode.id, week.week_number);
  }
  const { data: leagueDanceScores } =
    leagueSlotPeriods.length > 0 && episodeWeekNumber.size > 0
      ? await supabase
          .from("dance_scores")
          .select("couple_id, episode_id, total_score")
          .in("episode_id", [...episodeWeekNumber.keys()])
          .in("couple_id", [...new Set(leagueSlotPeriods.map((slot) => slot.coupleId))])
      : { data: [] as { couple_id: string; episode_id: string; total_score: number }[] };
  const judgePointsInputs = {
    scores: (leagueDanceScores ?? []).map((row) => ({
      coupleId: row.couple_id,
      weekNumber: episodeWeekNumber.get(row.episode_id) ?? 0,
      totalScore: row.total_score,
    })),
    judgesScoreStartsWeek: scoringSettings?.judges_score_starts_week ?? 1,
    multiplier: scoringSettings?.judges_score_multiplier ?? 1,
    categoryWeight: scoringSettings?.judges_score_category_weight ?? 1,
  };
  const flatCouplesById = new Map(flatCouples.map((c) => [c.id, c]));

  // Your Picks → Your roster: the viewer's roster as it stood in the selected
  // week (so a Recast swap reads correctly), that week's points per couple
  // and a running total.
  const yourSlotsForWeek = leagueSlotPeriods.filter(
    (slot) =>
      slot.managerId === user.id &&
      (yourRosterWeek ? slotActiveInWeek(slot, yourRosterWeek.week_number) : slot.endWeek === null)
  );
  const yourRosterPoints = yourRosterWeek
    ? judgePointsThroughWeek({ ...judgePointsInputs, slots: yourSlotsForWeek, week: yourRosterWeek.week_number })
    : undefined;
  const rosterCouples = yourSlotsForWeek.flatMap((slot) => {
    const couple = flatCouplesById.get(slot.coupleId);
    if (!couple) return [];
    const points = yourRosterPoints?.get(slot.coupleId);
    const names = allDisplayNames.get(slot.coupleId) ?? { celebrity: couple.celebrity_name, pro: couple.pro_name };
    const clamped = clampRosterCoupleForWeek(
      { status: couple.status, eliminationWeek: couple.elimination_week },
      {
        cutoffWeek: yourRosterWeek?.week_number ?? null,
        finaleWeekNumber,
        weekNumber: yourRosterWeek?.week_number ?? null,
        rawWeeklyPoints: points?.week ?? 0,
      }
    );
    return [{ ...names, coupleId: slot.coupleId, ...clamped, totalPoints: points?.total }];
  });
  const yourRosterNeighbors = yourRosterWeek
    ? adjacentThisWeekWeeks(visibleDanceWeeks, yourRosterWeek.id)
    : { prev: null, next: null };

  // Standings → Dance Cards: everyone's current roster with season totals.
  const currentSlotPeriods = leagueSlotPeriods.filter((slot) => slot.endWeek === null);
  const seasonPointsByCouple = latestVisibleDanceWeek
    ? judgePointsThroughWeek({
        ...judgePointsInputs,
        slots: currentSlotPeriods,
        week: latestVisibleDanceWeek.week_number,
      })
    : undefined;
  const leagueRosters = showLeagueRosters
    ? buildLeagueRosters({
        managers: orderManagersForRosters(standings, user.id),
        slots: currentSlotPeriods,
        couples: flatCouples
          .filter((c) => c.season_id === activeSeasonId)
          .map((c) => ({
            id: c.id,
            status: c.status,
            eliminationWeek: c.elimination_week,
            names: allDisplayNames.get(c.id) ?? { celebrity: c.celebrity_name, pro: c.pro_name },
          })),
        viewerId: user.id,
        asOfWeek: latestVisibleDanceWeek?.week_number,
        pointsByCoupleId: seasonPointsByCouple
          ? new Map([...seasonPointsByCouple].map(([coupleId, p]) => [coupleId, { total: p.total }]))
          : undefined,
      })
    : null;

  const recastSlotSource = (rosterSlots ?? [])
    .filter((s) => s.couples)
    .map((s) => ({
      slotNumber: s.slot_number,
      coupleId: s.couple_id!,
      celebrity: s.couples!.celebrity?.name ?? "Unknown",
      pro: s.couples!.pro?.name ?? "Unknown",
      status: s.couples!.status,
      eliminationWeek: s.couples!.elimination_week,
    }));
  const { revealedOpen: revealedRecastSlots, hiddenOpenCount: hiddenRecastOpenCount } =
    partitionRecastSlots(recastSlotSource, latestCompletedWeek, finaleWeekNumber);

  let recastOpenSlots: { slotNumber: number; formerCoupleName: string }[] = [];
  let recastAvailableCouples: { id: string; celebrity_name: string; pro_name: string }[] = [];
  if (danceCardOn && waiversOn && revealedRecastSlots.length > 0) {
    recastOpenSlots = revealedRecastSlots.map((s) => ({
      slotNumber: s.slotNumber,
      formerCoupleName: formatCoupleName(allDisplayNames.get(s.coupleId) ?? { celebrity: s.celebrity, pro: s.pro }),
    }));

    const { data: leagueRosteredSlots } = await supabase
      .from("roster_slots")
      .select("couple_id")
      .eq("league_id", id)
      .is("end_week", null);
    const rosteredCoupleIds = new Set((leagueRosteredSlots ?? []).map((s) => s.couple_id));
    recastAvailableCouples = activeCouples
      .filter((c) => !rosteredCoupleIds.has(c.id))
      .map((c) => ({ id: c.id, celebrity_name: c.celebrity_name, pro_name: c.pro_name }))
      .sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));
  }

  // Reverse-standings recast priority is worst-record-first — the lowest
  // scorer gets priority #1. Only meaningful for that claim method; other
  // methods (fcfs/manual) have no stable pre-computed priority to show.
  const recastPriorityRank = standings.length - rank + 1;

  let onTheClockName: string | null = null;
  let isMyTurn = false;
  let draftPickCount = 0;
  let onTheClockAutopilot = false;
  if (danceCardOn && league.draft_status === "in_progress") {
    const { count } = await supabase
      .from("draft_picks")
      .select("id", { count: "exact", head: true })
      .eq("league_id", id);
    draftPickCount = count ?? 0;
    const onTheClockId = managerIdForPick(
      draftPickCount + 1,
      members ?? [],
      league.draft_type as DraftType,
      league.custom_pick_order
    );
    const onTheClock = (members ?? []).find((m) => m.user_id === onTheClockId);
    onTheClockName = onTheClock?.profiles?.display_name ?? null;
    isMyTurn = onTheClock?.user_id === user.id;
    onTheClockAutopilot = onTheClock?.draft_autopilot ?? false;
  }

  const { data: myMemberships } = await supabase
    .from("league_members")
    .select("leagues(id, name)")
    .eq("user_id", user.id);

  const RECENT_JOIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const joinCutoffMs = Date.now() - RECENT_JOIN_WINDOW_MS;

  const otherLeagueSummaries = await Promise.all(
    (myMemberships ?? [])
      .map((m) => m.leagues!)
      .filter((l) => l.id !== id)
      .map((otherLeague) =>
        computeLeagueHomeSummary(
          supabase,
          user.id,
          otherLeague,
          upcomingEpisode ?? null,
          latestCompletedWeekId,
          latestCompletedResultsPublishedAt,
          joinCutoffMs,
          cutoff.allowedEpisodeIds
        )
      )
  );

  const switcherLeagues = [
    { id, name: league.name, rank, totalMembers: standings.length, picksDue: picksNeeded },
    ...otherLeagueSummaries.map((l) => ({
      id: l.id,
      name: l.name,
      rank: l.rank,
      totalMembers: l.totalMembers,
      picksDue: l.picksDue,
    })),
  ];

  const curtainCallSelection = curtainCallOn
    ? selectCurtainCallWeek(completedEpisodes ?? [], upcomingEpisode ?? null, cutoff.allowedEpisodeIds, weekParam)
    : { episode: null, mode: null };
  const curtainCallEpisode = curtainCallSelection.episode;
  const curtainCallMode = curtainCallSelection.mode;
  const pastPicksLocked =
    curtainCallMode === "recap" && curtainCallEpisode
      ? isPastPicksLocked(curtainCallEpisode.id, cutoff.allowedEpisodeIds)
      : false;
  const curtainCallWeeks = buildCurtainCallWeeks(
    (completedEpisodes ?? []).map((e) => ({
      id: e.id,
      weekNumber: e.week_number,
      theme: e.theme,
    })),
    upcomingEpisode
      ? { id: upcomingEpisode.id, weekNumber: upcomingEpisode.week_number, theme: upcomingEpisode.theme }
      : null
  );

  let pastPicksComparison = null;
  if (curtainCallMode === "recap" && curtainCallEpisode && !pastPicksLocked) {
    const recapEpisodeIds = curtainCallEpisode.episodeIds;
    const [{ data: pastPrediction }, { data: pastResults }, { data: pastDanceScores }] = await Promise.all([
      supabase
        .from("predictions")
        .select("predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id")
        .eq("league_id", id)
        .eq("week_id", curtainCallEpisode.id)
        .eq("manager_id", user.id)
        .maybeSingle(),
      recapEpisodeIds.length > 0
        ? supabase.from("episode_results").select("couple_id, outcome").in("episode_id", recapEpisodeIds)
        : Promise.resolve({ data: [] }),
      recapEpisodeIds.length > 0
        ? supabase.from("dance_scores").select("couple_id, total_score").in("episode_id", recapEpisodeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const predictionPoints =
      (allScores ?? []).find((row) => row.week_id === curtainCallEpisode.id && row.manager_id === user.id)
        ?.prediction_points ?? 0;

    pastPicksComparison = buildPastPicksComparison({
      isDoubleElimination: curtainCallEpisode.is_double_elimination_week,
      predictedEliminatedCoupleId: pastPrediction?.predicted_eliminated_couple_id ?? null,
      predictedEliminatedCoupleId2: pastPrediction?.predicted_eliminated_couple_id_2 ?? null,
      predictedTopScorerCoupleId: pastPrediction?.predicted_top_scorer_couple_id ?? null,
      episodeOutcomes: (pastResults ?? []).map((r) => ({ coupleId: r.couple_id, outcome: r.outcome })),
      danceScores: (pastDanceScores ?? []).map((s) => ({ coupleId: s.couple_id, totalScore: s.total_score })),
      predictionPoints,
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <LeagueHeader
        leagueId={id}
        inviteCode={league.invite_code}
        danceCardOn={danceCardOn}
        waiversOn={waiversOn}
        canEdit={isCommissioner}
        justCreated={justCreated === "1"}
        scoringConfigured={scoringSettings?.scoring_configured ?? true}
        switcherLeagues={switcherLeagues}
        accountSettingsData={accountSettingsData}
        viewerEmail={user.email ?? ""}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <LeagueTabs
        leagueId={id}
        activeTab={activeTab}
        yourPicks={
          <div className="flex flex-col gap-6">
            {curtainCallOn && (
              <div className="flex flex-col gap-3">
                {showSectionLabels && <SectionLabel module="curtainCall" first />}
                <CurtainCallCard
                  leagueId={id}
                  rosterWeekId={rosterWeekParam}
                  episode={
                    curtainCallEpisode
                      ? {
                          id: curtainCallEpisode.id,
                          weekNumber: curtainCallEpisode.week_number,
                          theme: curtainCallEpisode.theme,
                          nightsLabel: curtainCallEpisode.nightsLabel,
                        }
                      : null
                  }
                  weeks={curtainCallWeeks}
                  invite={
                    curtainCallMode === "picks" && !isLocked
                      ? "Who's taking their final bow, and who's stealing the show? Make your call before the curtain rises."
                      : undefined
                  }
                >
                  {curtainCallMode === "picks" && upcomingEpisode ? (
                    <PickEmBox
                      leagueId={id}
                      episode={upcomingEpisode}
                      lockAt={lockAt}
                      activeCouples={activeCouples}
                      totalCouples={seasonCouples.length}
                      eliminationPredictionPoints={scoringSettings?.elimination_prediction_points ?? 171}
                      topScorerPredictionPoints={scoringSettings?.top_scorer_prediction_points ?? 114}
                      coupleDisplayNames={Object.fromEntries(activeDisplayNames)}
                      existingPrediction={ownPrediction}
                      isLocked={isLocked}
                      isDoubleElimination={upcomingEpisode.is_double_elimination_week}
                      revealedPredictions={revealedPredictions}
                      otherLeagues={otherLeaguePicks.curtainCall}
                    />
                  ) : curtainCallMode === "recap" && curtainCallEpisode ? (
                    <PastPicksRecap
                      episodeWeekNumber={curtainCallEpisode.week_number}
                      locked={pastPicksLocked}
                      comparison={pastPicksComparison}
                      coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                    />
                  ) : null}
                </CurtainCallCard>
              </div>
            )}
            {danceCardOn && (
              <div className="flex flex-col gap-3">
                {showSectionLabels && <SectionLabel module="danceCard" first={!curtainCallOn} />}
                <DraftStatusCard
                  leagueId={id}
                  draftStatus={league.draft_status}
                  scheduledAt={league.draft_scheduled_at}
                  isCommissioner={isCommissioner}
                  memberCount={(members ?? []).length}
                  pickCount={draftPickCount}
                  onTheClockName={onTheClockName}
                  isMyTurn={isMyTurn}
                  currentTurnStartedAt={league.current_turn_started_at}
                  pickTimeLimitSeconds={league.pick_time_limit_seconds}
                  onTheClockAutopilot={onTheClockAutopilot}
                />
                {rosterCouples.length > 0 && (
                  <RosterCard
                    couples={rosterCouples}
                    totalPoints={pointsByManager.get(user.id) ?? 0}
                    carousel={
                      yourRosterWeek ? (
                        <EpisodeCarousel
                          weekNumber={yourRosterWeek.week_number}
                          theme={yourRosterWeek.theme}
                          nightsLabel={yourRosterWeek.nightsLabel}
                          prevHref={
                            yourRosterNeighbors.prev
                              ? rosterWeekHref(id, yourRosterNeighbors.prev.id, weekParam)
                              : null
                          }
                          nextHref={
                            yourRosterNeighbors.next
                              ? rosterWeekHref(id, yourRosterNeighbors.next.id, weekParam)
                              : null
                          }
                        />
                      ) : undefined
                    }
                  />
                )}
                {waiversOn && (
                  <RecastNudgeCard
                    leagueId={id}
                    openSlots={recastOpenSlots}
                    hiddenOpenSlotCount={hiddenRecastOpenCount}
                    pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null}
                    availableCouples={recastAvailableCouples}
                    coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                    claimMethod={league.waiver_claim_method}
                    priorityRank={recastPriorityRank}
                    totalManagers={standings.length}
                  />
                )}
                {showLeagueRosters && (
                  <Link
                    href={`/leagues/${id}?tab=standings#rosters`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    See Everyone&apos;s Dance Cards →
                  </Link>
                )}
              </div>
            )}
            {grandFinaleOn && (
              <div className="flex flex-col gap-3">
                {showSectionLabels && (
                  <SectionLabel module="grandFinale" first={!curtainCallOn && !danceCardOn} />
                )}
                <GrandFinaleBox
                  leagueId={id}
                  couples={seasonCouplesSpoilerSafe}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                  existingOrder={grandFinaleOrder}
                  deadline={grandFinaleDeadline}
                  isLocked={grandFinaleLocked}
                  otherLeagues={otherLeaguePicks.grandFinale}
                />
              </div>
            )}
            {!curtainCallOn && !danceCardOn && !grandFinaleOn && (
              <Card>
                <CardHeader>
                  <CardTitle>No scoring modules are on</CardTitle>
                  <CardDescription>
                    This league hasn&apos;t turned on Dance Card, Curtain Call, or Grand Finale yet — there&apos;s
                    nothing to pick. Ask your commissioner to enable one in League Settings.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        }
        standings={
          <div>
            <StandingsTable
              standings={standingsWithChange}
              currentUserId={user.id}
              latestCompletedWeek={latestCompletedWeek}
              viewerRank={rank}
              viewerTotalPoints={userPoints}
              categoryBreakdown={categoryBreakdown}
              standingMessage={standingMessage}
            />
            <StandingsModuleBreakdown
              members={moduleBreakdownMembers}
              danceCardOn={danceCardOn}
              curtainCallOn={curtainCallOn}
              grandFinaleOn={grandFinaleOn}
            />
            {leagueRosters && (
              <div id="rosters" className="mt-6 scroll-mt-4">
                <LeagueRostersCard
                  description="Where every couple ended up."
                  unrosteredLabel="Not on a roster"
                  note="Points are judges' scores only. Survival and placement bonuses count toward manager totals, not couples."
                  {...leagueRosters}
                />
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}

// Only rendered once 2+ modules are on (see showSectionLabels above) — a
// single-module league has nothing to disambiguate, so it skips straight
// to its one card. `first` drops the divider a later section gets, since
// nothing above it needs separating from.
function SectionLabel({ module, first }: { module: ScoringModuleKey; first?: boolean }) {
  const { icon, name } = scoringModule(module);
  return (
    <div
      className={
        first
          ? "flex items-center gap-1.5 text-sm font-semibold text-accent"
          : "flex items-center gap-1.5 border-t border-border pt-4 text-sm font-semibold text-accent"
      }
    >
      <span>{icon}</span>
      {name}
    </div>
  );
}
