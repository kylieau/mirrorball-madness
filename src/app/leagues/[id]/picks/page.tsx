import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RosterCard } from "@/components/roster-card";
import { RosterMoves } from "@/components/roster-moves";
import { DanceCardLeagueList, type DanceCardLeagueEntry } from "@/components/dance-card-league-list";
import { CurtainCallCard } from "@/components/curtain-call-card";
import { PickEmBox } from "@/components/pick-em-box";
import { loadDraftLineup, weekLineup, type DraftLineupRow } from "@/lib/draft-lineup";
import { PastPicksRecap } from "@/components/past-picks-card";
import { CurtainCallLeagueList, type CurtainCallLeagueEntry } from "@/components/curtain-call-league-list";
import { GrandFinaleBox } from "@/components/grand-finale-box";
import { loadOtherLeaguePicks } from "@/lib/other-league-picks";
import { DraftStatusCard } from "@/components/draft-status-card";
import { RecastCatchUpCard } from "@/components/recast-catch-up-card";
import { LifelineCatchUpCard } from "@/components/lifeline-card";
import { loadLifelineWeek } from "@/lib/lifeline-week-data";
import { mapRosterMoveCouples } from "@/lib/league-triage";
import { loadRosterMoveTabs } from "@/lib/roster-moves-data";
import { LeaguePageShell } from "@/components/league-page-shell";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { draftDanceScores, excludeReleasedCoupleRows, unpostedDraftDances } from "@/lib/draft-scores";
import { danceMaxScore, danceScoreColumns } from "@/lib/episode-teams";
import { managerIdForPick, type DraftType } from "@/lib/draft";
import { clampRosterCoupleForWeek, formerCoupleNote, weeklyBonusPoints } from "@/lib/roster-weekly-points";
import { partitionRecastSlots } from "@/lib/recast-framing";
import { scoringModule, type ScoringModuleKey } from "@/lib/scoring-modules";
import { EpisodeCarousel } from "@/components/episode-carousel";
import { adjacentThisWeekWeeks, rosterWeekHref } from "@/lib/this-week-carousel";
import { spoilerSafeCoupleStatus } from "@/lib/spoiler-safe-couple-status";
import { clampSlotsToWeek, formerSlotsForWeek, judgePointsThroughWeek, slotActiveInWeek } from "@/lib/roster-couple-points";
import { roundPoints } from "@/lib/format-points";
import { formatManagerName } from "@/lib/manager-display";
import {
  buildCurtainCallWeeks,
  buildPastPicksComparison,
  isPastPicksLocked,
  selectCurtainCallWeek,
} from "@/lib/past-picks";
import { couplesRemainingAtWeek, curtainCallPayout, type GrandFinaleMethod, type TierPayStyle } from "@/lib/scoring";
import { seasonFinaleWeek } from "@/lib/weekly-score-rows";
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
import {
  CURTAIN_CALL_PICK_COLUMNS,
  curtainCallPickFromRow,
  hasCurtainCallPicks,
  type CurtainCallPick,
} from "@/lib/curtain-call-picks";

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
    teamsMode,
    danceCardRule,
  } = base;

  const curtainCallWeekId = upcomingEpisode && curtainCallOn ? upcomingEpisode.id : null;

  const latestVisibleDanceWeek = visibleDanceWeeks[visibleDanceWeeks.length - 1] ?? null;
  const yourRosterWeek =
    visibleDanceWeeks.find((w) => w.id === rosterWeekParam) ?? latestVisibleDanceWeek;
  // Couple pages opened from here come back to the same Curtain Call and roster weeks.
  const historyFrom = yourRosterWeek
    ? rosterWeekHref(id, yourRosterWeek.id, weekParam)
    : `/leagues/${id}/picks${weekParam ? `?week=${weekParam}` : ""}`;
  const yourRosterWeekEpisodeIds =
    groupedWeeks.find((w) => w.id === yourRosterWeek?.id)?.episodes.map((e) => e.id) ?? [];

  const episodeWeekNumber = new Map<string, number>();
  for (const week of groupedWeeks) {
    if (!scoredIds.has(week.id) && week.id !== draftNight?.weekId) continue;
    for (const episode of week.episodes) episodeWeekNumber.set(episode.id, week.week_number);
  }
  if (draftNight) {
    for (const episodeId of draftNight.episodeIds) episodeWeekNumber.set(episodeId, draftNight.weekNumber);
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
  const recapEpisode = curtainCallMode === "recap" && curtainCallEpisode && !pastPicksLocked ? curtainCallEpisode : null;

  // None of these depends on another, so they start together and are awaited
  // where they're used instead of one round trip after another.
  const ownPredictionPending = curtainCallWeekId
    ? supabase
        .from("predictions")
        .select(CURTAIN_CALL_PICK_COLUMNS)
        .eq("league_id", id)
        .eq("week_id", curtainCallWeekId)
        .eq("manager_id", myTeamId)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const ownGrandFinalePicksPending = grandFinaleOn
    ? supabase
        .from("grand_finale_predictions")
        .select("couple_id, predicted_position")
        .eq("league_id", id)
        .eq("manager_id", myTeamId)
        .order("predicted_position", { ascending: true })
    : Promise.resolve({ data: null });
  type LeagueDanceRow = { couple_id: string; episode_id: string; total_score: number; scaled_score: number; max_score?: number | null; team_id?: string | null };
  const leagueDanceScoresPending: PromiseLike<{ data: LeagueDanceRow[] | null }> =
    leagueSlotPeriods.length > 0 && episodeWeekNumber.size > 0
      ? supabase
          .from("dance_scores")
          .select(danceScoreColumns(teamsMode, "couple_id, episode_id, total_score, scaled_score", { teamId: true }))
          .in("episode_id", [...episodeWeekNumber.keys()])
          .in("couple_id", [...new Set(leagueSlotPeriods.map((slot) => slot.coupleId))])
          .then((result) => ({ data: result.data as unknown as LeagueDanceRow[] | null }))
      : Promise.resolve({ data: [] as LeagueDanceRow[] });
  // Dance Card v2/v3 lines come from each couple's history: under v2 a
  // settled Fantasy Bonus in any visible week moves every later line, and
  // under v3 every settled outcome counts toward survival.
  const leagueBonusesPending =
    danceCardRule.version !== "v1" && leagueSlotPeriods.length > 0 && episodeWeekNumber.size > 0
      ? supabase
          .from("episode_results")
          .select("episode_id, couple_id, bonus_points, outcome")
          .in("episode_id", [...episodeWeekNumber.keys()])
      : Promise.resolve({ data: [] as { episode_id: string; couple_id: string; bonus_points: number; outcome: string }[] });
  const yourRosterWeekJeopardyPending =
    yourRosterWeekEpisodeIds.length > 0
      ? supabase.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", yourRosterWeekEpisodeIds)
      : Promise.resolve({ data: [] as { couple_id: string }[] });
  const draftPickCountPending =
    danceCardOn && league.draft_status === "in_progress"
      ? supabase.from("draft_picks").select("id", { count: "exact", head: true }).eq("league_id", id)
      : Promise.resolve({ count: null });
  const lifelinePending = loadLifelineWeek(supabase, base);
  const rosterMovesPending = loadRosterMoveTabs(supabase, base);
  type LifelinePayoutRow = { manager_id: string; slot_number: number; couple_id: string; weighted_points: number };
  const lifelinePayoutsPending: PromiseLike<{ data: LifelinePayoutRow[] | null }> =
    league.lifeline_enabled && yourRosterWeek
      ? supabase
          .from("lifeline_payouts")
          .select("manager_id, slot_number, couple_id, weighted_points")
          .eq("league_id", id)
          .eq("week_id", yourRosterWeek.id)
          .order("slot_number")
      : Promise.resolve({ data: [] });
  const recapEpisodeIds = recapEpisode?.episodeIds ?? [];
  const recapPending = recapEpisode
    ? Promise.all([
        supabase
          .from("predictions")
          .select(`manager_id, ${CURTAIN_CALL_PICK_COLUMNS}`)
          .eq("league_id", id)
          .eq("week_id", recapEpisode.id),
        recapEpisodeIds.length > 0
          ? supabase.from("episode_results").select("couple_id, outcome").in("episode_id", recapEpisodeIds)
          : Promise.resolve({ data: [] as { couple_id: string; outcome: string }[] }),
        recapEpisodeIds.length > 0
          ? supabase.from("dance_scores").select("couple_id, total_score").in("episode_id", recapEpisodeIds)
          : Promise.resolve({ data: [] as { couple_id: string; total_score: number }[] }),
        recapEpisodeIds.length > 0
          ? supabase.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", recapEpisodeIds)
          : Promise.resolve({ data: [] as { couple_id: string }[] }),
      ])
    : null;

  const [
    { data: grandFinaleDeadlineData },
    { data: anchorWeekData },
    { data: computedLockAt },
  ] = await Promise.all([
    grandFinaleOn
      ? supabase.rpc("effective_grand_finale_deadline", { p_league_id: id })
      : Promise.resolve({ data: null }),
    grandFinaleOn
      ? supabase.rpc("effective_hard_deadline_week", { p_league_id: id })
      : Promise.resolve({ data: null }),
    curtainCallWeekId
      ? supabase.rpc("prediction_lock_at", { p_league_id: id, p_week_id: curtainCallWeekId })
      : Promise.resolve({ data: null }),
  ]);
  const grandFinaleDeadline = grandFinaleDeadlineData ?? null;
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
    // Before a draft completes, the stored anchor is stale: the draft will
    // freeze it forward to the next unaired week, so price couples on that.
    scoringStartsWeek: anchorWeekData ?? scoringSettings?.judges_score_starts_week ?? 1,
    finaleWeek: seasonFinaleWeek(groupedWeeks),
    completedThroughWeek: cutoff.effectiveLatestEpisode?.week_number ?? 0,
  };
  // Section labels (🔮 Curtain Call / 🪩 Dance Card / 🏆 Grand Finale) only
  // earn their keep once there's more than one module on the page to tell
  // apart — a single-module league goes straight to its content.
  const showSectionLabels = [curtainCallOn, danceCardOn, grandFinaleOn].filter(Boolean).length >= 2;

  const lockAt = computedLockAt ?? null;
  const isLocked = !!lockAt && new Date() >= new Date(lockAt);

  const flatCouplesById = new Map(flatCouples.map((c) => [c.id, c]));
  const ownCurrentSlots = rosterSlotPeriods.filter((slot) => slot.managerId === myTeamId && slot.endWeek === null);
  const { revealedOpen: revealedRecastSlots, hiddenOpenCount: hiddenRecastOpenCount } = partitionRecastSlots(
    ownCurrentSlots.flatMap((slot) => {
      const couple = flatCouplesById.get(slot.coupleId);
      return couple ? [{ status: couple.status, eliminationWeek: couple.elimination_week }] : [];
    }),
    latestCompletedWeek,
    finaleWeekNumber
  );
  // A spot with no couple at all was emptied by a trade.
  const openRecastSpots =
    revealedRecastSlots.length +
    (league.draft_status === "completed" ? Math.max(0, league.roster_size - ownCurrentSlots.length) : 0);
  const recastOn = danceCardOn && waiversOn;
  const recastOpen = recastOn && league.draft_status === "completed";

  // Peer picks stay behind the lock/deadline checks; RLS gates them too, but
  // the page decides what to show from these flags.
  const [
    { data: allPredictions },
    { data: lateRows },
    { data: allGrandFinalePicks },
    otherLeaguePicks,
    draftLineupRows,
    { data: recastCycleRows },
    lifeline,
    rosterMoveTabs,
  ] = await Promise.all([
    curtainCallWeekId && isLocked
      ? supabase
          .from("predictions")
          .select(`manager_id, ${CURTAIN_CALL_PICK_COLUMNS}`)
          .eq("league_id", id)
          .eq("week_id", curtainCallWeekId)
      : Promise.resolve({ data: null }),
    grandFinaleOn && grandFinaleLocked
      ? supabase.from("grand_finale_late_unlocks").select("manager_id, late_factor, submitted_at").eq("league_id", id)
      : Promise.resolve({ data: null }),
    // League at a Glance is visible to everyone once the season-wide deadline
    // has passed, regardless of the viewer's own submission — no manager_id
    // filter, unlike the viewer's own order.
    grandFinaleOn && grandFinaleLocked
      ? supabase.from("grand_finale_predictions").select("manager_id, couple_id, predicted_position").eq("league_id", id)
      : Promise.resolve({ data: null }),
    loadOtherLeaguePicks(supabase, {
      userId: user.id,
      currentLeagueId: id,
      curtainCallWeekId: curtainCallWeekId && !isLocked ? curtainCallWeekId : null,
      includeGrandFinale: grandFinaleOn && !grandFinaleLocked,
      now: new Date(),
    }),
    curtainCallMode === "picks" && curtainCallWeekId && !isLocked ? loadDraftLineup(supabase) : Promise.resolve([] as DraftLineupRow[]),
    recastOpen ? supabase.rpc("recast_next_cycle", { p_league_id: id }) : Promise.resolve({ data: null }),
    lifelinePending,
    rosterMovesPending,
  ]);
  const recastCycle = recastCycleRows?.[0];
  const rosterMoves = rosterMoveTabs.tabs.length > 0 && !cutoff.pendingRevealEpisode && (
    <RosterMoves
      leagueId={id}
      tabs={rosterMoveTabs.tabs}
      moves={mapRosterMoveCouples(
        rosterMoveTabs.moves,
        (coupleId) => allDisplayNames.get(coupleId) ?? { celebrity: "Unknown", pro: "Unknown" }
      )}
      managerNames={nameByManager}
      from={historyFrom}
    />
  );
  const pickLineup = upcomingEpisode
    ? Object.fromEntries(weekLineup(draftLineupRows, upcomingEpisode, completedEpisodes, cutoff.allowedEpisodeIds))
    : {};

  const { data: ownPrediction } = await ownPredictionPending;
  const curtainCallPicksEntries: CurtainCallLeagueEntry[] = (allPredictions ?? [])
    .filter((p) => p.manager_id !== myTeamId)
    .map((p) => ({
      managerId: p.manager_id,
      displayName: nameByManager[p.manager_id] ?? "Unknown",
      pick: curtainCallPickFromRow(p),
      comparison: null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const { data: ownGrandFinalePicks } = await ownGrandFinalePicksPending;
  const grandFinaleOrder =
    ownGrandFinalePicks && ownGrandFinalePicks.length > 0 ? ownGrandFinalePicks.map((p) => p.couple_id) : null;

  const lateFactorByManager: Record<string, number> = Object.fromEntries(
    (lateRows ?? []).map((row) => [row.manager_id, Number(row.late_factor)])
  );
  const ownLate = (lateRows ?? []).find((row) => row.manager_id === myTeamId);
  const ownLateEntry = ownLate ? { factor: Number(ownLate.late_factor), open: ownLate.submitted_at == null } : null;

  const leagueGrandFinale =
    grandFinaleOn && grandFinaleLocked
      ? buildLeagueGrandFinalePredictions({
          predictions: allGrandFinalePicks ?? [],
          members: members ?? [],
          viewerTeamId: myTeamId,
          lateFactorByManager,
        })
      : [];

  const [{ data: leagueDanceScores }, { data: leagueBonuses }, { data: lifelinePayoutRows }] = await Promise.all([
    leagueDanceScoresPending,
    leagueBonusesPending,
    lifelinePayoutsPending,
  ]);

  // Lifelines settled in the roster's paged week: a line per pick, and part
  // of that week's Dance Card points.
  const lifelinesFor = (managerId: string) =>
    (lifelinePayoutRows ?? [])
      .filter((row) => row.manager_id === managerId)
      .map((row) => ({
        ...(allDisplayNames.get(row.couple_id) ?? { celebrity: "Unknown", pro: "Unknown" }),
        coupleId: row.couple_id,
        points: Number(row.weighted_points),
      }));
  const lifelineTotal = (lifelines: { points: number }[]) => lifelines.reduce((sum, line) => sum + line.points, 0);
  const judgePointsInputs = {
    scores: [
      ...excludeReleasedCoupleRows(leagueDanceScores ?? [], draftNight?.releasedCoupleIdsByEpisode ?? {})
        .map((row) => ({
          episodeId: row.episode_id,
          coupleId: row.couple_id,
          weekNumber: episodeWeekNumber.get(row.episode_id) ?? 0,
          totalScore: Number(row.total_score),
          scaledScore: Number(row.scaled_score),
          maxScore: danceMaxScore(row),
        })),
      ...(draftNight
        ? draftDanceScores(unpostedDraftDances(draftNight.dances, (leagueDanceScores ?? []).map((row) => row.team_id))).map((dance) => ({
            ...dance,
            weekNumber: draftNight.weekNumber,
          }))
        : []),
    ],
    judgesScoreStartsWeek: scoringSettings?.judges_score_starts_week ?? 1,
    multiplier: scoringSettings?.judges_score_multiplier ?? 1,
    categoryWeight: scoringSettings?.judges_score_category_weight ?? 1,
    rule: danceCardRule,
    bonuses: (leagueBonuses ?? []).map((row) => ({
      weekNumber: episodeWeekNumber.get(row.episode_id) ?? 0,
      coupleId: row.couple_id,
      bonusPoints: Number(row.bonus_points),
      outcome: row.outcome,
    })),
  };

  // Your Picks → Your roster: the viewer's roster as it stood in the selected
  // week (so a Recast swap reads correctly), that week's points per couple
  // and a running total.
  // With no scored week to page to, the roster is what the viewer may see
  // as of nothing watched, not the current rows.
  const yourSlotsForWeek = yourRosterWeek
    ? leagueSlotPeriods.filter((slot) => slot.managerId === myTeamId && slotActiveInWeek(slot, yourRosterWeek.week_number))
    : clampSlotsToWeek(leagueSlotPeriods, cutoff.effectiveLatestEpisode?.week_number ?? 0).filter(
        (slot) => slot.managerId === myTeamId && slot.endWeek === null
      );
  // Every period of a couple held in the paged week, so a couple claimed
  // back keeps what it earned the first time.
  const heldPeriodsFor = (managerId: string, week: number) => {
    const held = new Set(
      leagueSlotPeriods.filter((slot) => slot.managerId === managerId && slotActiveInWeek(slot, week)).map((slot) => slot.coupleId)
    );
    return leagueSlotPeriods.filter((slot) => slot.managerId === managerId && held.has(slot.coupleId) && slot.startWeek <= week);
  };
  const yourRosterPoints = yourRosterWeek
    ? judgePointsThroughWeek({ ...judgePointsInputs, slots: heldPeriodsFor(myTeamId, yourRosterWeek.week_number), week: yourRosterWeek.week_number })
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
  const yourLifelines = lifelinesFor(myTeamId);
  const yourRosterWeekTotalPoints = roundPoints(
    yourRosterWeekRosterPoints * judgePointsInputs.categoryWeight + lifelineTotal(yourLifelines)
  );
  // Under Dance Card v2 nothing sits outside the couples' credits; under v3
  // survival and the Fantasy Bonus do, as under v1.
  const yourRosterWeekBonusPoints = yourRosterWeek && danceCardRule.version !== "v2"
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
  const { data: yourRosterWeekJeopardy } = await yourRosterWeekJeopardyPending;
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
  // Couples that left a manager's roster before the paged week keep a
  // dimmed card with what they earned while held (Kylie, 2026-11-12), so the
  // totals account for every judges' point the manager has earned.
  const formerCouplesFor = (managerId: string) => {
    if (!yourRosterWeek) return [];
    const week = yourRosterWeek.week_number;
    const former = formerSlotsForWeek(leagueSlotPeriods, managerId, week, judgePointsInputs.judgesScoreStartsWeek);
    if (former.length === 0) return [];
    const points = judgePointsThroughWeek({ ...judgePointsInputs, slots: former.flatMap((f) => f.periods), week });
    return former.flatMap(({ coupleId, periods }) => {
      const couple = flatCouplesById.get(coupleId);
      if (!couple) return [];
      const lastEnd = Math.max(...periods.map((p) => p.endWeek!));
      const next = leagueSlotPeriods.find((slot) => slot.coupleId === coupleId && slot.managerId !== managerId && slot.startWeek === lastEnd + 1);
      const holderNow = leagueSlotPeriods.find((slot) => slot.coupleId === coupleId && slot.managerId !== managerId && slotActiveInWeek(slot, week));
      const { tag, weeks, note } = formerCoupleNote({
        periods: periods.map((p) => ({ from: p.startWeek, to: p.endWeek })),
        next: next ? { source: next.source } : null,
        holderNow: holderNow ? { name: nameByManager[holderNow.managerId] ?? "Unknown" } : null,
        status: spoilerSafeCoupleStatus({ status: couple.status, eliminationWeek: couple.elimination_week }, week, finaleWeekNumber),
      });
      const names = allDisplayNames.get(coupleId) ?? { celebrity: couple.celebrity_name, pro: couple.pro_name };
      return [{ ...names, coupleId, tag, weeklyPoints: 0, totalPoints: points.get(coupleId)?.total ?? 0, inJeopardy: false, former: { weeks, note } }];
    });
  };
  const yourFormerCouples = formerCouplesFor(myTeamId);
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
      const points = judgePointsThroughWeek({ ...judgePointsInputs, slots: heldPeriodsFor(m.managerId, yourRosterWeek.week_number), week: yourRosterWeek.week_number });
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
      const former = formerCouplesFor(m.managerId).map(({ celebrity, pro, coupleId, tag, weeklyPoints, former }) => ({ celebrity, pro, coupleId, tag, weeklyPoints, former }));
      const lifelines = lifelinesFor(m.managerId);
      return {
        managerId: m.managerId,
        displayName: m.displayName,
        weekPoints: roundPoints(weekRosterPoints * categoryWeight + lifelineTotal(lifelines)),
        lifelines,
        bonusPoints:
          danceCardRule.version !== "v2"
            ? weeklyBonusPoints(weekRosterPoints, categoryWeight, couples.map((c) => c.weeklyPoints))
            : 0,
        couples: [...couples, ...former],
      };
    });
    danceCardLeagueEntries.sort(
      (a, b) => b.weekPoints - a.weekPoints || a.displayName.localeCompare(b.displayName)
    );
  }

  let onTheClockName: string | null = null;
  let isMyTurn = false;
  let draftPickCount = 0;
  let onTheClockAutopilot = false;
  if (danceCardOn && league.draft_status === "in_progress") {
    const { count } = await draftPickCountPending;
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
  if (recapEpisode && recapPending) {
    const [{ data: allPastPredictions }, { data: pastResults }, { data: pastDanceScores }, { data: pastJeopardy }] =
      await recapPending;

    const nearMissEnabled = scoringSettings?.curtain_call_near_miss_enabled !== false;
    const remaining = couplesRemainingAtWeek(
      seasonCouples.map((c) => ({ eliminationWeek: c.elimination_week })),
      recapEpisode.week_number
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

    const comparisonFor = (pick: CurtainCallPick, managerId: string) =>
      buildPastPicksComparison({
        isDoubleElimination: recapEpisode.is_double_elimination_week,
        predictedEliminatedCoupleId: pick.elim1,
        predictedEliminatedCoupleId2: pick.elim2,
        predictedTopScorerCoupleId: pick.topScorer,
        finalePodium: recapEpisode.is_finale ? pick.podium : undefined,
        episodeOutcomes,
        danceScores,
        predictionPoints:
          scoreRows.find((row) => row.week_id === recapEpisode.id && row.manager_id === managerId)
            ?.prediction_points ?? 0,
        inJeopardyCoupleIds,
        nearMissEnabled,
        eliminationExactPayout,
        topScorerExactPayout,
      });

    const ownPastPrediction = (allPastPredictions ?? []).find((p) => p.manager_id === myTeamId);
    pastPicksComparison = comparisonFor(curtainCallPickFromRow(ownPastPrediction), myTeamId);

    curtainCallRecapEntries = (allPastPredictions ?? [])
      .filter((p) => p.manager_id !== myTeamId)
      .map((p) => {
        const pick = curtainCallPickFromRow(p);
        return {
          managerId: p.manager_id,
          displayName: nameByManager[p.manager_id] ?? "Unknown",
          pick,
          comparison: comparisonFor(pick, p.manager_id),
        };
      })
      .sort(
        (a, b) =>
          (b.comparison?.predictionPoints ?? 0) - (a.comparison?.predictionPoints ?? 0) ||
          a.displayName.localeCompare(b.displayName)
      );
  }

  return (
    <LeaguePageShell tab="picks" base={base} error={error} message={message} justCreated={justCreated}>
      <div className="flex flex-col gap-4">
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
                  key={`${id}:${upcomingEpisode.id}:${isLocked}`}
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
                  categoryWeight={scoringSettings?.eliminations_category_weight ?? 1}
                  nearMissEnabled={scoringSettings?.curtain_call_near_miss_enabled !== false}
                  coupleDisplayNames={Object.fromEntries(activeDisplayNames)}
                  lineup={pickLineup}
                  existingPick={curtainCallPickFromRow(ownPrediction)}
                  isLocked={isLocked}
                  isDoubleElimination={upcomingEpisode.is_double_elimination_week}
                  isFinale={upcomingEpisode.is_finale}
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
                  isFinale={curtainCallEpisode.is_finale}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                  entries={curtainCallPicksEntries}
                  historyFrom={historyFrom}
                />
              )}
              {curtainCallMode === "recap" && curtainCallEpisode && !pastPicksLocked && (
                <CurtainCallLeagueList
                  leagueId={id}
                  weekId={curtainCallEpisode.id}
                  weekNumber={curtainCallEpisode.week_number}
                  isDoubleElimination={curtainCallEpisode.is_double_elimination_week}
                  isFinale={curtainCallEpisode.is_finale}
                  coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                  entries={curtainCallRecapEntries}
                  historyFrom={historyFrom}
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
                couples={[...rosterCouples, ...yourFormerCouples]}
                totalPoints={yourRosterWeekTotalPoints}
                weekBonusPoints={yourRosterWeekBonusPoints}
                categoryWeight={judgePointsInputs.categoryWeight}
                lifelines={yourLifelines}
                historyFrom={historyFrom}
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
                      historyFrom={historyFrom}
                    />
                  ) : undefined
                }
              />
            )}
            {rosterMoves}
            {lifeline?.state === "catch-up" && (
              <LifelineCatchUpCard pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null} />
            )}
            {recastCycle?.start_week != null && openRecastSpots === 0 && hiddenRecastOpenCount > 0 && (
              <RecastCatchUpCard pendingRevealWeek={cutoff.pendingRevealEpisode?.week_number ?? null} />
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
              categoryWeight={scoringSettings?.bonus_picks_category_weight ?? 1}
              scoring={grandFinaleScoring}
              leagueGrandFinale={leagueGrandFinale}
              historyFrom={historyFrom}
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
          : "flex items-center gap-1.5 border-t border-border pt-3 text-sm font-semibold text-accent"
      }
    >
      <span>{icon}</span>
      {name}
    </div>
  );
}
