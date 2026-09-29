import { createClient } from "@/lib/supabase/server";
import { StandingsTable } from "@/components/standings-table";
import { CouplesLeaderboard } from "@/components/couples-leaderboard";
import { LeaguePageShell } from "@/components/league-page-shell";
import { loadLeaguePageBase } from "@/lib/league-page-data";
import { getStandingMessage } from "@/lib/standings-message";
import { replaceWeekDanceScores } from "@/lib/draft-scores";
import { scoringModule } from "@/lib/scoring-modules";
import { buildCouplesLeaderboard } from "@/lib/couples-leaderboard";
import { loadCoupleWeekResults } from "@/lib/couples-leaderboard-data";
import { roundPoints } from "@/lib/format-points";

export default async function LeagueStandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; justCreated?: string }>;
}) {
  const { id } = await params;
  const { error, message, justCreated } = await searchParams;
  const supabase = await createClient();
  const base = await loadLeaguePageBase(supabase, id);
  const {
    scoringSettings,
    danceCardOn,
    curtainCallOn,
    grandFinaleOn,
    members,
    myTeamId,
    revealing,
    scoredIds,
    revealingVisible,
    draftNight,
    draftManagers,
    scoreRows,
    pointsByManager,
    rosterPointsByManager,
    predictionPointsByManager,
    grandFinalePointsByManager,
    standings,
    latestCompletedWeekId,
    latestCompletedWeek,
    rank,
    seasonCouplesSpoilerSafe,
    allDisplayNames,
    showLeagueRosters,
    leagueSlotPeriods,
    visibleDanceWeeks,
  } = base;

  // Rank-change arrows compare current standings to what they'd have been
  // without the most recently completed week's scores — no historical
  // snapshot table needed, since weekly_manager_scores already carries points
  // per competition week.
  // Rank arrows and the week column compare against the week being revealed
  // while there is one, else the latest completed week.
  const changeFocusWeekId =
    draftNight && draftManagers.length > 0
      ? draftNight.weekId
      : revealing && revealingVisible
        ? revealing.week.id
        : latestCompletedWeekId;

  const previousPointsByManager = new Map<string, number>();
  if (changeFocusWeekId) {
    for (const row of scoreRows) {
      if (!scoredIds.has(row.week_id) && row.week_id !== draftNight?.weekId) continue;
      if (row.week_id === changeFocusWeekId) continue;
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
  const previousRanks = changeFocusWeekId ? ranksFromPoints(previousPointsByManager) : null;

  const latestWeekPointsByManager = new Map<string, number>();
  for (const row of scoreRows) {
    if (row.week_id === changeFocusWeekId && (scoredIds.has(row.week_id) || row.week_id === draftNight?.weekId)) {
      latestWeekPointsByManager.set(row.manager_id, row.total_points);
    }
  }

  const standingsWithChange = standings.map((s) => {
    const weekPoints = changeFocusWeekId ? (latestWeekPointsByManager.get(s.managerId) ?? 0) : null;
    if (!previousRanks) return { ...s, weekPoints, change: null as "up" | "down" | "same" | null };
    const curr = currentRanks.get(s.managerId)!;
    const prev = previousRanks.get(s.managerId)!;
    const change: "up" | "down" | "same" = curr < prev ? "up" : curr > prev ? "down" : "same";
    return { ...s, weekPoints, change };
  });

  const moduleTotalsByManager = Object.fromEntries(
    standings.map((s) => [
      s.managerId,
      {
        curtainCall: curtainCallOn
          ? roundPoints(
              (predictionPointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.eliminations_category_weight ?? 1)
            )
          : null,
        danceCard: danceCardOn
          ? roundPoints(
              (rosterPointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.judges_score_category_weight ?? 1)
            )
          : null,
        grandFinale: grandFinaleOn
          ? roundPoints(
              (grandFinalePointsByManager.get(s.managerId) ?? 0) * (scoringSettings?.bonus_picks_category_weight ?? 1)
            )
          : null,
      },
    ])
  );

  const userPoints = pointsByManager.get(myTeamId) ?? 0;
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
    isPreSeason: scoreRows.length === 0,
  });

  const categoryBreakdown = (
    [
      curtainCallOn && {
        label: scoringModule("curtainCall").name,
        icon: scoringModule("curtainCall").icon,
        points: roundPoints(
          (predictionPointsByManager.get(myTeamId) ?? 0) * (scoringSettings?.eliminations_category_weight ?? 1)
        ),
      },
      danceCardOn && {
        label: scoringModule("danceCard").name,
        icon: scoringModule("danceCard").icon,
        points: roundPoints(
          (rosterPointsByManager.get(myTeamId) ?? 0) * (scoringSettings?.judges_score_category_weight ?? 1)
        ),
      },
      grandFinaleOn && {
        label: scoringModule("grandFinale").name,
        icon: scoringModule("grandFinale").icon,
        points: roundPoints(
          (grandFinalePointsByManager.get(myTeamId) ?? 0) * (scoringSettings?.bonus_picks_category_weight ?? 1)
        ),
      },
    ]
  ).filter((c) => c !== false);

  // Standings → Couples Leaderboard: every cast couple ranked by what it has
  // earned for its manager, undrafted ones as a what-if.
  const managerNameById = new Map(standings.map((s) => [s.managerId, s.displayName]));
  const couplesLeaderboard =
    showLeagueRosters && scoringSettings
      ? buildCouplesLeaderboard({
          scoring: {
            judgesScoreMultiplier: scoringSettings.judges_score_multiplier,
            survivalPoints: scoringSettings.survival_points,
            eliminationPredictionPoints: scoringSettings.elimination_prediction_points,
            topScorerPredictionPoints: scoringSettings.top_scorer_prediction_points,
            firstPlacePoints: scoringSettings.first_place_points,
            secondPlacePoints: scoringSettings.second_place_points,
            thirdPlacePoints: scoringSettings.third_place_points,
            fourthPlacePoints: scoringSettings.fourth_place_points,
            fifthPlacePoints: scoringSettings.fifth_place_points,
            curtainCallNearMissEnabled: scoringSettings.curtain_call_near_miss_enabled !== false,
          },
          anchorWeek: scoringSettings.judges_score_starts_week,
          categoryWeight: scoringSettings.judges_score_category_weight,
          weeks: replaceWeekDanceScores(await loadCoupleWeekResults(supabase, visibleDanceWeeks), draftNight && draftNight.dances.length > 0
            ? {
                weekNumber: draftNight.weekNumber,
                danceScores: draftNight.dances.map((dance) => ({ coupleId: dance.coupleId, totalScore: dance.total })),
              }
            : null),
          couples: seasonCouplesSpoilerSafe,
          slots: leagueSlotPeriods,
        }).map((standing) => {
          const couple = seasonCouplesSpoilerSafe.find((c) => c.id === standing.coupleId)!;
          const names = allDisplayNames.get(couple.id) ?? { celebrity: couple.celebrity_name, pro: couple.pro_name };
          return {
            ...standing,
            celebrity: names.celebrity,
            pro: names.pro,
            ownerName: standing.ownerId ? (managerNameById.get(standing.ownerId) ?? "Unknown") : null,
            isViewer: standing.ownerId === myTeamId,
            eliminated: couple.status === "eliminated" || couple.status === "withdrawn",
          };
        })
        .sort((a, b) => b.totalPoints - a.totalPoints || a.celebrity.localeCompare(b.celebrity))
      : null;

  return (
    <LeaguePageShell tab="standings" base={base} error={error} message={message} justCreated={justCreated}>
      <StandingsTable
        leagueId={id}
        standings={standingsWithChange}
        currentUserId={myTeamId}
        latestCompletedWeek={latestCompletedWeek}
        viewerRank={rank}
        viewerTotalPoints={userPoints}
        categoryBreakdown={categoryBreakdown}
        standingMessage={standingMessage}
        moduleTotals={moduleTotalsByManager}
      />
      {couplesLeaderboard && <CouplesLeaderboard rows={couplesLeaderboard} />}
    </LeaguePageShell>
  );
}
