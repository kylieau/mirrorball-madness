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
import { PickEmBox } from "@/components/pick-em-box";
import { GrandFinaleBox } from "@/components/grand-finale-box";
import { DraftStatusCard } from "@/components/draft-status-card";
import { RecastNudgeCard } from "@/components/recast-nudge-card";
import { computeLeagueHomeSummary } from "@/lib/league-home-summary";
import { LeagueHeader } from "@/components/league-header";
import { LeagueTabs } from "@/components/league-tabs";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { getStandingMessage } from "@/lib/standings-message";
import { getPickAssignment } from "@/lib/draft";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string; justCreated?: string }>;
}) {
  const { id } = await params;
  const { error, message, justCreated } = await searchParams;
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
  const grandFinaleDeadline = scoringSettings?.bonus_picks_deadline ?? null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);

  const [{ data: members }, { data: allScores }, { data: rosterSlots }, { data: allCouples }, { data: upcomingEpisode }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("user_id, role, joined_at, draft_position, profiles(display_name)")
        .eq("league_id", id)
        .order("joined_at"),
      supabase
        .from("weekly_manager_scores")
        .select("episode_id, manager_id, roster_points, prediction_points, grand_finale_points, total_points")
        .eq("league_id", id),
      supabase
        .from("roster_slots")
        .select(
          "slot_number, couple_id, couples(status, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name))"
        )
        .eq("league_id", id)
        .eq("manager_id", user.id)
        .is("end_week", null),
      supabase
        .from("couples")
        .select(
          "id, status, season_id, elimination_week, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"
        ),
      supabase
        .from("episodes")
        .select("id, week_number, airs_at")
        .eq("status", "upcoming")
        .order("week_number", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const isCommissioner = (members ?? []).some((m) => m.user_id === user.id && m.role === "commissioner");

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: premiereEpisode }, { data: completedEpisodes }] = await Promise.all([
    supabase
      .from("episodes")
      .select("airs_at")
      .eq("season_id", activeSeasonId ?? "")
      .eq("week_number", 1)
      .maybeSingle(),
    supabase
      .from("episodes")
      .select("id, week_number")
      .eq("season_id", activeSeasonId ?? "")
      .eq("status", "completed")
      .order("week_number", { ascending: false })
      .limit(1),
  ]);

  const pointsByManager = new Map<string, number>();
  const rosterPointsByManager = new Map<string, number>();
  const predictionPointsByManager = new Map<string, number>();
  const grandFinalePointsByManager = new Map<string, number>();
  const scoresByEpisode: Record<
    string,
    { managerId: string; rosterPoints: number; predictionPoints: number; grandFinalePoints: number; totalPoints: number }[]
  > = {};
  for (const row of allScores ?? []) {
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
    (scoresByEpisode[row.episode_id] ??= []).push({
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
  // without the most recently completed episode's scores — no historical
  // snapshot table needed, since weekly_manager_scores already carries points
  // per episode.
  const latestCompletedEpisodeId = completedEpisodes?.[0]?.id ?? null;
  const latestCompletedWeek = completedEpisodes?.[0]?.week_number ?? null;

  const previousPointsByManager = new Map<string, number>();
  if (latestCompletedEpisodeId) {
    for (const row of allScores ?? []) {
      if (row.episode_id === latestCompletedEpisodeId) continue;
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
  const previousRanks = latestCompletedEpisodeId ? ranksFromPoints(previousPointsByManager) : null;

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
    (c) => c.status === "active" && c.season_id === activeSeasonId
  );
  const seasonCouples = flatCouples.filter((c) => c.season_id === activeSeasonId);
  // Historical lookups (roster, revealed predictions) span every couple this
  // league has ever touched; the Pick 'Em picker is scoped to just the couples
  // actually offered, so collisions are checked against that pool specifically.
  const allDisplayNames = buildCoupleDisplayNames(flatCouples);
  const activeDisplayNames = buildCoupleDisplayNames(activeCouples);

  let isLocked = false;
  let lockAt: string | null = null;
  let ownPrediction = null;
  let revealedPredictions:
    | { displayName: string; eliminatedLabel: string | null; topScorerLabel: string | null }[]
    | undefined;

  if (upcomingEpisode && curtainCallOn) {
    const { data: computedLockAt } = await supabase.rpc("prediction_lock_at", {
      p_league_id: id,
      p_episode_id: upcomingEpisode.id,
    });
    lockAt = computedLockAt;
    isLocked = !!lockAt && new Date() >= new Date(lockAt);

    const { data } = await supabase
      .from("predictions")
      .select("predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
      .eq("league_id", id)
      .eq("episode_id", upcomingEpisode.id)
      .eq("manager_id", user.id)
      .maybeSingle();
    ownPrediction = data;

    if (isLocked) {
      const { data: allPredictions } = await supabase
        .from("predictions")
        .select("manager_id, predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
        .eq("league_id", id)
        .eq("episode_id", upcomingEpisode.id);

      revealedPredictions = (allPredictions ?? []).map((p) => {
        const eliminatedParts = p.predicted_eliminated_couple_id
          ? allDisplayNames.get(p.predicted_eliminated_couple_id)
          : undefined;
        const topScorerParts = p.predicted_top_scorer_couple_id
          ? allDisplayNames.get(p.predicted_top_scorer_couple_id)
          : undefined;
        return {
          displayName: nameByManager[p.manager_id] ?? "Unknown",
          eliminatedLabel: eliminatedParts ? formatCoupleName(eliminatedParts) : null,
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

  const picksNeeded =
    (curtainCallOn && !!upcomingEpisode && !isLocked && !ownPrediction) ||
    (grandFinaleOn && !grandFinaleLocked && !grandFinaleOrder);

  const categoryBreakdown = (
    [
      danceCardOn && {
        label: "Dance Card",
        points: Math.round(
          (rosterPointsByManager.get(user.id) ?? 0) * (scoringSettings?.judges_score_category_weight ?? 1)
        ),
      },
      curtainCallOn && {
        label: "Curtain Call",
        points: Math.round(
          (predictionPointsByManager.get(user.id) ?? 0) * (scoringSettings?.eliminations_category_weight ?? 1)
        ),
      },
      grandFinaleOn && {
        label: "Grand Finale",
        points: Math.round(
          (grandFinalePointsByManager.get(user.id) ?? 0) * (scoringSettings?.bonus_picks_category_weight ?? 1)
        ),
      },
    ] as const
  ).filter((c): c is { label: string; points: number } => !!c);

  const rosterCouples = (rosterSlots ?? [])
    .filter((r) => r.couples)
    .map((r) => ({
      ...(allDisplayNames.get(r.couple_id!) ?? {
        celebrity: r.couples!.celebrity?.name ?? "Unknown",
        pro: r.couples!.pro?.name ?? "Unknown",
      }),
      status: r.couples!.status,
    }));

  const openSlotCount = rosterCouples.filter(
    (c) => c.status === "eliminated" || c.status === "withdrawn"
  ).length;

  let recastOpenSlots: { slotNumber: number; formerCoupleName: string }[] = [];
  let recastAvailableCouples: { id: string; celebrity_name: string; pro_name: string }[] = [];
  if (danceCardOn && waiversOn && openSlotCount > 0) {
    recastOpenSlots = (rosterSlots ?? [])
      .filter((s) => s.couples?.status === "eliminated" || s.couples?.status === "withdrawn")
      .map((s) => ({
        slotNumber: s.slot_number,
        formerCoupleName: formatCoupleName(
          allDisplayNames.get(s.couple_id!) ?? {
            celebrity: s.couples!.celebrity?.name ?? "Unknown",
            pro: s.couples!.pro?.name ?? "Unknown",
          }
        ),
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
  if (danceCardOn && league.draft_status === "in_progress") {
    const { count } = await supabase
      .from("draft_picks")
      .select("id", { count: "exact", head: true })
      .eq("league_id", id);
    draftPickCount = count ?? 0;
    const { draftPosition } = getPickAssignment(
      draftPickCount + 1,
      (members ?? []).length,
      league.draft_type as "snake" | "linear"
    );
    const onTheClock = (members ?? []).find((m) => m.draft_position === draftPosition);
    onTheClockName = onTheClock?.profiles?.display_name ?? null;
    isMyTurn = onTheClock?.user_id === user.id;
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
        computeLeagueHomeSummary(supabase, user.id, otherLeague, upcomingEpisode ?? null, latestCompletedEpisodeId, joinCutoffMs)
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <LeagueHeader
        leagueId={id}
        leagueName={league.name}
        inviteCode={league.invite_code}
        danceCardOn={danceCardOn}
        waiversOn={waiversOn}
        league={league}
        scoringSettings={scoringSettings}
        canEdit={isCommissioner}
        premiereAirsAt={premiereEpisode?.airs_at ?? null}
        justCreated={justCreated === "1"}
        scoringConfigured={scoringSettings?.scoring_configured ?? true}
        switcherLeagues={switcherLeagues}
        viewerDisplayName={members?.find((m) => m.user_id === user.id)?.profiles?.display_name ?? "?"}
        members={(members ?? []).map((m) => ({
          userId: m.user_id,
          displayName: m.profiles?.display_name ?? "Unknown",
          role: m.role,
        }))}
      />

      <LeagueTabs
        yourPicks={
          <div className="flex flex-col gap-6">
            {curtainCallOn && (
              <PickEmBox
                leagueId={id}
                episode={upcomingEpisode ?? null}
                lockAt={lockAt}
                activeCouples={activeCouples}
                coupleDisplayNames={Object.fromEntries(activeDisplayNames)}
                existingPrediction={ownPrediction}
                isLocked={isLocked}
                revealedPredictions={revealedPredictions}
              />
            )}
            {danceCardOn && (
              <DraftStatusCard
                leagueId={id}
                draftStatus={league.draft_status}
                scheduledAt={league.draft_scheduled_at}
                isCommissioner={isCommissioner}
                memberCount={(members ?? []).length}
                pickCount={draftPickCount}
                onTheClockName={onTheClockName}
                isMyTurn={isMyTurn}
              />
            )}
            {danceCardOn && rosterCouples.length > 0 && (
              <RosterCard couples={rosterCouples} totalPoints={pointsByManager.get(user.id) ?? 0} />
            )}
            {danceCardOn && waiversOn && (
              <RecastNudgeCard
                leagueId={id}
                openSlots={recastOpenSlots}
                availableCouples={recastAvailableCouples}
                coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                claimMethod={league.waiver_claim_method}
                priorityRank={recastPriorityRank}
                totalManagers={standings.length}
              />
            )}
            {grandFinaleOn && (
              <GrandFinaleBox
                leagueId={id}
                couples={seasonCouples}
                coupleDisplayNames={Object.fromEntries(allDisplayNames)}
                existingOrder={grandFinaleOrder}
                deadline={grandFinaleDeadline}
                isLocked={grandFinaleLocked}
              />
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
          </div>
        }
      />
    </div>
  );
}
