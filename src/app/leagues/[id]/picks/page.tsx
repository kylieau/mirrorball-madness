import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RosterCard } from "@/components/roster-card";
import { DanceCardLeagueList, type DanceCardLeagueEntry } from "@/components/dance-card-league-list";
import { CurtainCallCard } from "@/components/curtain-call-card";
import { PickEmBox } from "@/components/pick-em-box";
import { PastPicksRecap } from "@/components/past-picks-card";
import { CurtainCallLeagueList, type CurtainCallLeagueEntry } from "@/components/curtain-call-league-list";
import { GrandFinaleBox } from "@/components/grand-finale-box";
import { loadOtherLeaguePicks } from "@/lib/other-league-picks";
import { DraftStatusCard } from "@/components/draft-status-card";
import { RecastNudgeCard } from "@/components/recast-nudge-card";
import { LeaguePageShell } from "@/components/league-page-shell";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { formatCoupleName } from "@/lib/couple-display";
import { excludeReleasedCoupleRows } from "@/lib/draft-scores";
import { managerIdForPick, type DraftType } from "@/lib/draft";
import { clampRosterCoupleForWeek, weeklyBonusPoints } from "@/lib/roster-weekly-points";
import { partitionRecastSlots } from "@/lib/recast-framing";
import { scoringModule, type ScoringModuleKey } from "@/lib/scoring-modules";
import { EpisodeCarousel } from "@/components/episode-carousel";
import { adjacentThisWeekWeeks, rosterWeekHref } from "@/lib/this-week-carousel";
import { judgePointsThroughWeek, slotActiveInWeek } from "@/lib/roster-couple-points";
import { roundPoints } from "@/lib/format-points";
import { formatManagerName } from "@/lib/manager-display";
import {
  buildCurtainCallWeeks,
  buildPastPicksComparison,
  isPastPicksLocked,
  selectCurtainCallWeek,
} from "@/lib/past-picks";
import { couplesRemainingAtWeek, curtainCallPayout, type GrandFinaleMethod, type TierPayStyle } from "@/lib/scoring";
import {
  ELIMINATION_PREDICTION_POINTS_DEFAULT,
  TOP_SCORER_PREDICTION_POINTS_DEFAULT,
} from "@/lib/scoring-defaults";
import {
  GRAND_FINALE_DEFAULT_METHOD,
  GRAND_FINALE_DEFAULT_TIER_PAY_STYLE,
  defaultPointsPerCorrect,
} from "@/lib/grand-finale-explainer";
import { buildLeagueGrandFinalePredictions } from "@/lib/grand-finale-predictions";
import { hasCurtainCallPicks } from "@/lib/curtain-call-picks";

export default async function LeaguePicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; justCreated?: string; week?: string; rosterWeek?: string }>;
}) {
  const { id } = await params;
  const { error, message, justCreated, week: weekParam, rosterWeek: rosterWeekParam } = await searchParams;
  const supabase = await createClient();
  const base = await loadLeaguePageBase(supabase, id);
  const {
    user,
    league,
    scoringSettings,
    danceCardOn,
    waiversOn,
    curtainCallOn,
    grandFinaleOn,
    members,
    myTeamId,
    isCommissioner,
    groupedWeeks,
    upcomingEpisode,
    completedEpisodes,
    finaleWeekNumber,
    cutoff,
    scoredIds,
    draftNight,
    scoreRows,
    standings,
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
    visibleDanceWeeks,
  } = base;

  const grandFinaleDeadline = grandFinaleOn
    ? (await supabase.rpc("effective_grand_finale_deadline", { p_league_id: id })).data ?? null
    : null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);
  const grandFinaleScoring = {
    method: (scoringSettings?.bonus_picks_scoring_method as GrandFinaleMethod | null) ?? GRAND_FINALE_DEFAULT_METHOD,
    pointsPerCorrect:
      scoringSettings?.bonus_picks_points_per_correct ??
      defaultPointsPerCorrect(GRAND_FINALE_DEFAULT_METHOD, GRAND_FINALE_DEFAULT_TIER_PAY_STYLE),
    distancePenalty: scoringSettings?.bonus_picks_distance_penalty ?? null,
    tierSize: scoringSettings?.bonus_picks_tier_size ?? null,
    tierPayStyle:
      (scoringSettings?.bonus_picks_tier_pay_style as TierPayStyle | null) ?? GRAND_FINALE_DEFAULT_TIER_PAY_STYLE,
    scoringStartsWeek: scoringSettings?.judges_score_starts_week ?? 1,
  };
  // Section labels (🔮 Curtain Call / 🪩 Dance Card / 🏆 Grand Finale) only
  // earn their keep once there's more than one module on the page to tell
  // apart — a single-module league goes straight to its content.
  const showSectionLabels = [curtainCallOn, danceCardOn, grandFinaleOn].filter(Boolean).length >= 2;

  let isLocked = false;
  let lockAt: string | null = null;
  let ownPrediction = null;
  let curtainCallPicksEntries: CurtainCallLeagueEntry[] = [];

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
      .eq("manager_id", myTeamId)
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

      curtainCallPicksEntries = (allPredictions ?? [])
        .filter((p) => p.manager_id !== myTeamId)
        .map((p) => ({
          managerId: p.manager_id,
          displayName: nameByManager[p.manager_id] ?? "Unknown",
          eliminatedId: p.predicted_eliminated_couple_id,
          eliminatedId2: p.predicted_eliminated_couple_id_2,
          topScorerId: p.predicted_top_scorer_couple_id,
          comparison: null,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
  }

  let grandFinaleOrder: string[] | null = null;
  let ownLateEntry: { factor: number; open: boolean } | null = null;
  let lateFactorByManager: Record<string, number> = {};
  if (grandFinaleOn) {
    const { data: ownGrandFinalePicks } = await supabase
      .from("grand_finale_predictions")
      .select("couple_id, predicted_position")
      .eq("league_id", id)
      .eq("manager_id", myTeamId)
      .order("predicted_position", { ascending: true });
    grandFinaleOrder = ownGrandFinalePicks && ownGrandFinalePicks.length > 0
      ? ownGrandFinalePicks.map((p) => p.couple_id)
      : null;
  }

  if (grandFinaleOn && grandFinaleLocked) {
    const { data: lateRows } = await supabase
      .from("grand_finale_late_unlocks")
      .select("manager_id, late_factor, submitted_at")
      .eq("league_id", id);
    lateFactorByManager = Object.fromEntries(
      (lateRows ?? []).map((row) => [row.manager_id, Number(row.late_factor)])
    );
    const own = (lateRows ?? []).find((row) => row.manager_id === myTeamId);
    if (own) ownLateEntry = { factor: Number(own.late_factor), open: own.submitted_at == null };
  }

  // League at a Glance is visible to everyone once the season-wide deadline
  // has passed, regardless of the viewer's own submission — no manager_id
  // filter, unlike the query above.
  let leagueGrandFinale: ReturnType<typeof buildLeagueGrandFinalePredictions> = [];
  if (grandFinaleOn && grandFinaleLocked) {
    const { data: allGrandFinalePicks } = await supabase
      .from("grand_finale_predictions")
      .select("manager_id, couple_id, predicted_position")
      .eq("league_id", id);
    leagueGrandFinale = buildLeagueGrandFinalePredictions({
      predictions: allGrandFinalePicks ?? [],
      members: members ?? [],
      viewerTeamId: myTeamId,
      lateFactorByManager,
    });
  }

  const otherLeaguePicks = await loadOtherLeaguePicks(supabase, {
    userId: user.id,
    currentLeagueId: id,
    curtainCallWeekId: curtainCallOn && upcomingEpisode && !isLocked ? upcomingEpisode.id : null,
    includeGrandFinale: grandFinaleOn && !grandFinaleLocked,
    now: new Date(),
  });

  const latestVisibleDanceWeek = visibleDanceWeeks[visibleDanceWeeks.length - 1] ?? null;
  const yourRosterWeek =
    visibleDanceWeeks.find((w) => w.id === rosterWeekParam) ?? latestVisibleDanceWeek;

  const episodeWeekNumber = new Map<string, number>();
  for (const week of groupedWeeks) {
    if (!scoredIds.has(week.id) && week.id !== draftNight?.weekId) continue;
    for (const episode of week.episodes) episodeWeekNumber.set(episode.id, week.week_number);
  }
  if (draftNight) {
    for (const episodeId of draftNight.episodeIds) episodeWeekNumber.set(episodeId, draftNight.weekNumber);
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
    scores: [
      ...excludeReleasedCoupleRows(leagueDanceScores ?? [], draftNight?.releasedCoupleIdsByEpisode ?? {})
        .map((row) => ({
          coupleId: row.couple_id,
          weekNumber: episodeWeekNumber.get(row.episode_id) ?? 0,
          totalScore: row.total_score,
        })),
      ...(draftNight?.dances.map((dance) => ({
        coupleId: dance.coupleId,
        weekNumber: draftNight.weekNumber,
        totalScore: dance.total,
      })) ?? []),
    ],
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
      slot.managerId === myTeamId &&
      (yourRosterWeek ? slotActiveInWeek(slot, yourRosterWeek.week_number) : slot.endWeek === null)
  );
  const yourRosterPoints = yourRosterWeek
    ? judgePointsThroughWeek({ ...judgePointsInputs, slots: yourSlotsForWeek, week: yourRosterWeek.week_number })
    : undefined;
  const yourRosterWeekRosterPoints = yourRosterWeek
    ? scoreRows
        .filter(
          (row) =>
            row.manager_id === myTeamId &&
            groupedWeeks.find((w) => w.id === row.week_id)?.week_number === yourRosterWeek.week_number
        )
        .reduce((sum, row) => sum + row.roster_points, 0)
    : 0;
  // Header total on Your Fantasy Roster: this paged week's Dance Card
  // points, not the season-cumulative total — matches the carousel it sits
  // above, same weighting as danceCardLeagueEntries' weekPoints below.
  const yourRosterWeekTotalPoints = roundPoints(yourRosterWeekRosterPoints * judgePointsInputs.categoryWeight);
  const yourRosterWeekBonusPoints = yourRosterWeek
    ? weeklyBonusPoints(
        yourRosterWeekRosterPoints,
        judgePointsInputs.categoryWeight,
        yourSlotsForWeek.map((slot) => {
          const couple = flatCouplesById.get(slot.coupleId);
          if (!couple) return 0;
          return clampRosterCoupleForWeek(
            { status: couple.status, eliminationWeek: couple.elimination_week },
            {
              cutoffWeek: yourRosterWeek.week_number,
              finaleWeekNumber,
              weekNumber: yourRosterWeek.week_number,
              rawWeeklyPoints: yourRosterPoints?.get(slot.coupleId)?.week ?? 0,
            }
          ).weeklyPoints;
        })
      )
    : 0;
  const yourRosterWeekEpisodeIds =
    groupedWeeks.find((w) => w.id === yourRosterWeek?.id)?.episodes.map((e) => e.id) ?? [];
  const { data: yourRosterWeekJeopardy } =
    yourRosterWeekEpisodeIds.length > 0
      ? await supabase.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", yourRosterWeekEpisodeIds)
      : { data: [] as { couple_id: string }[] };
  const yourRosterWeekInJeopardy = new Set((yourRosterWeekJeopardy ?? []).map((row) => row.couple_id));
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
    return [
      {
        ...names,
        coupleId: slot.coupleId,
        ...clamped,
        totalPoints: points?.total,
        inJeopardy: yourRosterWeekInJeopardy.has(slot.coupleId),
      },
    ];
  });
  const yourRosterNeighbors = yourRosterWeek
    ? adjacentThisWeekWeeks(visibleDanceWeeks, yourRosterWeek.id)
    : { prev: null, next: null };

  // Your Picks → League at a Glance: every manager's roster points for this
  // same selected week, that week's total,
  // sourced from weekly_manager_scores (already correct across Recast swaps),
  // not re-derived from current slot ownership like seasonPointsByCouple below.
  let danceCardLeagueEntries: DanceCardLeagueEntry[] = [];
  if (showLeagueRosters && yourRosterWeek) {
    const weekNumberById = new Map(groupedWeeks.map((w) => [w.id, w.week_number]));
    const weekPointsByManager = new Map<string, number>();
    for (const row of scoreRows) {
      const weekNumber = weekNumberById.get(row.week_id);
      if (weekNumber !== yourRosterWeek.week_number) continue;
      weekPointsByManager.set(row.manager_id, (weekPointsByManager.get(row.manager_id) ?? 0) + row.roster_points);
    }
    const categoryWeight = scoringSettings?.judges_score_category_weight ?? 1;

    danceCardLeagueEntries = standings.filter((m) => m.managerId !== myTeamId).map((m) => {
      const slotsForWeek = leagueSlotPeriods.filter(
        (slot) => slot.managerId === m.managerId && slotActiveInWeek(slot, yourRosterWeek.week_number)
      );
      const points = judgePointsThroughWeek({ ...judgePointsInputs, slots: slotsForWeek, week: yourRosterWeek.week_number });
      const couples = slotsForWeek.flatMap((slot) => {
        const couple = flatCouplesById.get(slot.coupleId);
        if (!couple) return [];
        const p = points.get(slot.coupleId);
        const names = allDisplayNames.get(slot.coupleId) ?? { celebrity: couple.celebrity_name, pro: couple.pro_name };
        const clamped = clampRosterCoupleForWeek(
          { status: couple.status, eliminationWeek: couple.elimination_week },
          {
            cutoffWeek: yourRosterWeek.week_number,
            finaleWeekNumber,
            weekNumber: yourRosterWeek.week_number,
            rawWeeklyPoints: p?.week ?? 0,
          }
        );
        return [{ ...names, coupleId: slot.coupleId, ...clamped }];
      });
      const weekRosterPoints = weekPointsByManager.get(m.managerId) ?? 0;
      return {
        managerId: m.managerId,
        displayName: m.displayName,
        weekPoints: roundPoints(weekRosterPoints * categoryWeight),
        bonusPoints: weeklyBonusPoints(
          weekRosterPoints,
          categoryWeight,
          couples.map((c) => c.weeklyPoints)
        ),
        couples,
      };
    });
    danceCardLeagueEntries.sort(
      (a, b) => b.weekPoints - a.weekPoints || a.displayName.localeCompare(b.displayName)
    );
  }

  const { data: rosterSlots } = await supabase
    .from("roster_slots")
    .select(
      "slot_number, couple_id, couples(status, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name))"
    )
    .eq("league_id", id)
    .eq("manager_id", myTeamId)
    .is("end_week", null);
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
    onTheClockName = onTheClock
      ? formatManagerName({
          displayName: onTheClock.profiles?.display_name ?? "Unknown",
          coManagerDisplayName: onTheClock.co_manager?.display_name,
        })
      : null;
    isMyTurn = onTheClock?.user_id === myTeamId;
    onTheClockAutopilot = onTheClock?.draft_autopilot ?? false;
  }

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
  let curtainCallRecapEntries: CurtainCallLeagueEntry[] = [];
  if (curtainCallMode === "recap" && curtainCallEpisode && !pastPicksLocked) {
    const recapEpisodeIds = curtainCallEpisode.episodeIds;
    const [{ data: allPastPredictions }, { data: pastResults }, { data: pastDanceScores }, { data: pastJeopardy }] =
      await Promise.all([
      supabase
        .from("predictions")
        .select(
          "manager_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_top_scorer_couple_id"
        )
        .eq("league_id", id)
        .eq("week_id", curtainCallEpisode.id),
      recapEpisodeIds.length > 0
        ? supabase.from("episode_results").select("couple_id, outcome").in("episode_id", recapEpisodeIds)
        : Promise.resolve({ data: [] as { couple_id: string; outcome: string }[] }),
      recapEpisodeIds.length > 0
        ? supabase.from("dance_scores").select("couple_id, total_score").in("episode_id", recapEpisodeIds)
        : Promise.resolve({ data: [] as { couple_id: string; total_score: number }[] }),
      recapEpisodeIds.length > 0
        ? supabase.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", recapEpisodeIds)
        : Promise.resolve({ data: [] as { couple_id: string }[] }),
    ]);

    const nearMissEnabled = scoringSettings?.curtain_call_near_miss_enabled !== false;
    const remaining = couplesRemainingAtWeek(
      seasonCouples.map((c) => ({ eliminationWeek: c.elimination_week })),
      curtainCallEpisode.week_number
    );
    const episodeOutcomes = (pastResults ?? []).map((r) => ({ coupleId: r.couple_id, outcome: r.outcome }));
    const danceScores = (pastDanceScores ?? []).map((s) => ({ coupleId: s.couple_id, totalScore: Number(s.total_score) }));
    const inJeopardyCoupleIds = (pastJeopardy ?? []).map((row) => row.couple_id);
    const eliminationExactPayout = curtainCallPayout(
      scoringSettings?.elimination_prediction_points ?? ELIMINATION_PREDICTION_POINTS_DEFAULT,
      remaining,
      seasonCouples.length
    );
    const topScorerExactPayout = curtainCallPayout(
      scoringSettings?.top_scorer_prediction_points ?? TOP_SCORER_PREDICTION_POINTS_DEFAULT,
      remaining,
      seasonCouples.length
    );

    const comparisonFor = (prediction: {
      predicted_eliminated_couple_id: string | null;
      predicted_eliminated_couple_id_2: string | null;
      predicted_top_scorer_couple_id: string | null;
    } | undefined, managerId: string) =>
      buildPastPicksComparison({
        isDoubleElimination: curtainCallEpisode.is_double_elimination_week,
        predictedEliminatedCoupleId: prediction?.predicted_eliminated_couple_id ?? null,
        predictedEliminatedCoupleId2: prediction?.predicted_eliminated_couple_id_2 ?? null,
        predictedTopScorerCoupleId: prediction?.predicted_top_scorer_couple_id ?? null,
        episodeOutcomes,
        danceScores,
        predictionPoints:
          scoreRows.find((row) => row.week_id === curtainCallEpisode.id && row.manager_id === managerId)
            ?.prediction_points ?? 0,
        inJeopardyCoupleIds,
        nearMissEnabled,
        eliminationExactPayout,
        topScorerExactPayout,
      });

    const ownPastPrediction = (allPastPredictions ?? []).find((p) => p.manager_id === myTeamId);
    pastPicksComparison = comparisonFor(ownPastPrediction, myTeamId);

    curtainCallRecapEntries = (allPastPredictions ?? [])
      .filter((p) => p.manager_id !== myTeamId)
      .map((p) => ({
        managerId: p.manager_id,
        displayName: nameByManager[p.manager_id] ?? "Unknown",
        eliminatedId: p.predicted_eliminated_couple_id,
        eliminatedId2: p.predicted_eliminated_couple_id_2,
        topScorerId: p.predicted_top_scorer_couple_id,
        comparison: comparisonFor(p, p.manager_id),
      }))
      .sort(
        (a, b) =>
          (b.comparison?.predictionPoints ?? 0) - (a.comparison?.predictionPoints ?? 0) ||
          a.displayName.localeCompare(b.displayName)
      );
  }

  return (
    <LeaguePageShell tab="picks" base={base} error={error} message={message} justCreated={justCreated}>
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
                curtainCallMode === "picks" && !isLocked && !hasCurtainCallPicks(ownPrediction)
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
                  eliminationPredictionPoints={
                    scoringSettings?.elimination_prediction_points ?? ELIMINATION_PREDICTION_POINTS_DEFAULT
                  }
                  topScorerPredictionPoints={
                    scoringSettings?.top_scorer_prediction_points ?? TOP_SCORER_PREDICTION_POINTS_DEFAULT
                  }
                  nearMissEnabled={scoringSettings?.curtain_call_near_miss_enabled !== false}
                  coupleDisplayNames={Object.fromEntries(activeDisplayNames)}
                  existingPrediction={ownPrediction}
                  isLocked={isLocked}
                  isDoubleElimination={upcomingEpisode.is_double_elimination_week}
                  otherLeagues={otherLeaguePicks.curtainCall}
                />
              ) : curtainCallMode === "recap" && curtainCallEpisode ? (
                <PastPicksRecap
                  locked={pastPicksLocked}
                  comparison={pastPicksComparison}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                />
              ) : null}
              {curtainCallEpisode && isLocked && curtainCallMode === "picks" && (
                <CurtainCallLeagueList
                  leagueId={id}
                  weekId={curtainCallEpisode.id}
                  weekNumber={curtainCallEpisode.week_number}
                  isDoubleElimination={curtainCallEpisode.is_double_elimination_week}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                  entries={curtainCallPicksEntries}
                />
              )}
              {curtainCallMode === "recap" && curtainCallEpisode && !pastPicksLocked && (
                <CurtainCallLeagueList
                  leagueId={id}
                  weekId={curtainCallEpisode.id}
                  weekNumber={curtainCallEpisode.week_number}
                  isDoubleElimination={curtainCallEpisode.is_double_elimination_week}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                  entries={curtainCallRecapEntries}
                />
              )}
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
                totalPoints={yourRosterWeekTotalPoints}
                weekBonusPoints={yourRosterWeekBonusPoints}
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
                leagueSection={
                  yourRosterWeek ? (
                    <DanceCardLeagueList
                      leagueId={id}
                      weekId={yourRosterWeek.id}
                      entries={danceCardLeagueEntries}
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
              isLocked={grandFinaleLocked && !ownLateEntry?.open}
              lateEntry={ownLateEntry ? { factor: ownLateEntry.factor } : null}
              otherLeagues={otherLeaguePicks.grandFinale}
              scoring={grandFinaleScoring}
              leagueGrandFinale={leagueGrandFinale}
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
    </LeaguePageShell>
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
