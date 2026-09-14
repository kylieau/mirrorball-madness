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
import { HomeDashboard } from "@/components/home-dashboard";
import { LeagueHeader } from "@/components/league-header";
import { LeagueTabs } from "@/components/league-tabs";
import { WeeklyResultsView } from "@/components/weekly-results-view";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { getStandingMessage } from "@/lib/standings-message";

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

  const isCommissioner = league.commissioner_id === user.id;

  const danceCardOn = scoringSettings?.judges_score_category_enabled ?? true;
  const curtainCallOn = scoringSettings?.eliminations_category_enabled ?? true;
  const grandFinaleOn = scoringSettings?.bonus_picks_category_enabled ?? false;
  const grandFinaleDeadline = scoringSettings?.bonus_picks_deadline ?? null;
  const grandFinaleLocked = !!grandFinaleDeadline && new Date() >= new Date(grandFinaleDeadline);

  const [{ data: members }, { data: allScores }, { data: rosterSlots }, { data: allCouples }, { data: upcomingEpisode }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("user_id, role, joined_at, profiles(display_name)")
        .eq("league_id", id)
        .order("joined_at"),
      supabase
        .from("weekly_manager_scores")
        .select("episode_id, manager_id, roster_points, prediction_points, grand_finale_points, total_points")
        .eq("league_id", id),
      supabase
        .from("roster_slots")
        .select(
          "couple_id, couples(status, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name))"
        )
        .eq("league_id", id)
        .eq("manager_id", user.id),
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

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [
    { data: premiereEpisode },
    { data: completedEpisodes },
    { data: danceScores },
    { data: episodeResults },
    { data: danceStyles },
  ] = await Promise.all([
    supabase
      .from("episodes")
      .select("airs_at")
      .eq("season_id", activeSeasonId ?? "")
      .eq("week_number", 1)
      .maybeSingle(),
    supabase
      .from("episodes")
      .select("id, week_number, airs_at, theme, is_finale")
      .eq("season_id", activeSeasonId ?? "")
      .eq("status", "completed")
      .order("week_number", { ascending: false }),
    supabase.from("dance_scores").select("id, episode_id, couple_id, dance_style_id, total_score"),
    supabase
      .from("episode_results")
      .select("episode_id, couple_id, outcome, was_bottom_two, was_bottom_three"),
    supabase.from("dance_styles").select("id, name").order("name"),
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

  const deadlineCandidates: { label: string; iso: string }[] = [];
  if (curtainCallOn && lockAt && new Date(lockAt) > new Date()) {
    deadlineCandidates.push({ label: "Curtain Call", iso: lockAt });
  }
  if (grandFinaleOn && grandFinaleDeadline && new Date(grandFinaleDeadline) > new Date()) {
    deadlineCandidates.push({ label: "Grand Finale", iso: grandFinaleDeadline });
  }
  deadlineCandidates.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
  const nextDeadline = deadlineCandidates[0] ?? null;

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

  const { data: myMemberships } = await supabase
    .from("league_members")
    .select("leagues(id, name)")
    .eq("user_id", user.id);

  const RECENT_JOIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const joinCutoff = Date.now() - RECENT_JOIN_WINDOW_MS;

  // Eliminations are season-global, not league-scoped, so the latest week's
  // results (already fetched above for This Week) apply the same to every
  // league — no need to refetch per league, just attribute one activity line
  // per Dance-Card league the couple's manager happens to be in.
  const latestEliminatedNames = latestCompletedEpisodeId
    ? (episodeResults ?? [])
        .filter((r) => r.episode_id === latestCompletedEpisodeId && r.outcome === "eliminated")
        .map((r) => allDisplayNames.get(r.couple_id))
        .filter((parts): parts is NonNullable<typeof parts> => !!parts)
        .map((parts) => formatCoupleName(parts))
    : [];

  const currentRecentJoins = (members ?? [])
    .filter((m) => m.user_id !== user.id && new Date(m.joined_at).getTime() >= joinCutoff)
    .map((m) => ({ name: m.profiles?.display_name ?? "Someone", joinedAt: m.joined_at }));
  const currentTookLead = currentRanks.get(user.id) === 1 && (previousRanks?.get(user.id) ?? 1) !== 1;

  const otherLeagues = await Promise.all(
    (myMemberships ?? [])
      .map((m) => m.leagues!)
      .filter((l) => l.id !== id)
      .map(async (otherLeague) => {
        const [{ data: otherScoringSettings }, { data: otherMembers }, { data: otherScores }] = await Promise.all([
          supabase
            .from("scoring_settings")
            .select(
              "judges_score_category_enabled, eliminations_category_enabled, bonus_picks_category_enabled, bonus_picks_deadline"
            )
            .eq("league_id", otherLeague.id)
            .single(),
          supabase.from("league_members").select("user_id, joined_at, profiles(display_name)").eq("league_id", otherLeague.id),
          supabase
            .from("weekly_manager_scores")
            .select("episode_id, manager_id, total_points")
            .eq("league_id", otherLeague.id),
        ]);

        const otherPointsByManager = new Map<string, number>();
        const otherPreviousPointsByManager = new Map<string, number>();
        for (const row of otherScores ?? []) {
          otherPointsByManager.set(
            row.manager_id,
            (otherPointsByManager.get(row.manager_id) ?? 0) + row.total_points
          );
          if (row.episode_id !== latestCompletedEpisodeId) {
            otherPreviousPointsByManager.set(
              row.manager_id,
              (otherPreviousPointsByManager.get(row.manager_id) ?? 0) + row.total_points
            );
          }
        }
        const otherStandings = (otherMembers ?? []).map((m) => ({
          managerId: m.user_id,
          points: otherPointsByManager.get(m.user_id) ?? 0,
          previousPoints: otherPreviousPointsByManager.get(m.user_id) ?? 0,
        }));
        const otherRank = Math.max(
          1,
          [...otherStandings].sort((a, b) => b.points - a.points).findIndex((s) => s.managerId === user.id) + 1
        );
        const otherPreviousRank = latestCompletedEpisodeId
          ? Math.max(
              1,
              [...otherStandings]
                .sort((a, b) => b.previousPoints - a.previousPoints)
                .findIndex((s) => s.managerId === user.id) + 1
            )
          : null;

        const otherDanceCardOn = otherScoringSettings?.judges_score_category_enabled ?? true;
        const otherCurtainCallOn = otherScoringSettings?.eliminations_category_enabled ?? true;
        const otherGrandFinaleOn = otherScoringSettings?.bonus_picks_category_enabled ?? false;
        const otherGrandFinaleDeadline = otherScoringSettings?.bonus_picks_deadline ?? null;
        const otherGrandFinaleLocked =
          !!otherGrandFinaleDeadline && new Date() >= new Date(otherGrandFinaleDeadline);

        let otherLockAt: string | null = null;
        let otherPicksDue = false;
        if (otherCurtainCallOn && upcomingEpisode) {
          const { data } = await supabase.rpc("prediction_lock_at", {
            p_league_id: otherLeague.id,
            p_episode_id: upcomingEpisode.id,
          });
          otherLockAt = data;
          const otherIsLocked = !!otherLockAt && new Date() >= new Date(otherLockAt);
          if (!otherIsLocked) {
            const { data: otherPrediction } = await supabase
              .from("predictions")
              .select("manager_id")
              .eq("league_id", otherLeague.id)
              .eq("episode_id", upcomingEpisode.id)
              .eq("manager_id", user.id)
              .maybeSingle();
            otherPicksDue = !otherPrediction;
          }
        }
        let otherGrandFinalePicksDue = false;
        if (otherGrandFinaleOn && !otherGrandFinaleLocked) {
          const { data: otherGrandFinalePick } = await supabase
            .from("grand_finale_predictions")
            .select("manager_id")
            .eq("league_id", otherLeague.id)
            .eq("manager_id", user.id)
            .limit(1)
            .maybeSingle();
          otherGrandFinalePicksDue = !otherGrandFinalePick;
        }

        const otherDeadlineCandidates: { label: string; iso: string }[] = [];
        if (otherPicksDue && otherLockAt && new Date(otherLockAt) > new Date()) {
          otherDeadlineCandidates.push({ label: "Curtain Call", iso: otherLockAt });
        }
        if (otherGrandFinalePicksDue && otherGrandFinaleDeadline && new Date(otherGrandFinaleDeadline) > new Date()) {
          otherDeadlineCandidates.push({ label: "Grand Finale", iso: otherGrandFinaleDeadline });
        }
        otherDeadlineCandidates.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

        return {
          id: otherLeague.id,
          name: otherLeague.name,
          rank: otherRank,
          totalMembers: otherStandings.length,
          totalPoints: otherPointsByManager.get(user.id) ?? 0,
          picksDue: otherPicksDue || otherGrandFinalePicksDue,
          nextDeadline: otherDeadlineCandidates[0] ?? null,
          danceCardOn: otherDanceCardOn,
          curtainCallOn: otherCurtainCallOn,
          grandFinaleOn: otherGrandFinaleOn,
          recentJoins: (otherMembers ?? [])
            .filter((m) => m.user_id !== user.id && new Date(m.joined_at).getTime() >= joinCutoff)
            .map((m) => ({ name: m.profiles?.display_name ?? "Someone", joinedAt: m.joined_at })),
          tookLead: otherPreviousRank !== null && otherRank === 1 && otherPreviousRank !== 1,
        };
      })
  );

  const switcherLeagues = [
    { id, name: league.name, rank, totalMembers: standings.length, picksDue: picksNeeded },
    ...otherLeagues.map((l) => ({ id: l.id, name: l.name, rank: l.rank, totalMembers: l.totalMembers, picksDue: l.picksDue })),
  ];

  const homeLeagues = [
    {
      id,
      name: league.name,
      rank,
      totalMembers: standings.length,
      totalPoints: userPoints,
      picksDue: picksNeeded,
      danceCardOn,
      curtainCallOn,
      grandFinaleOn,
    },
    ...otherLeagues.map((l) => ({
      id: l.id,
      name: l.name,
      rank: l.rank,
      totalMembers: l.totalMembers,
      totalPoints: l.totalPoints,
      picksDue: l.picksDue,
      danceCardOn: l.danceCardOn,
      curtainCallOn: l.curtainCallOn,
      grandFinaleOn: l.grandFinaleOn,
    })),
  ];

  const urgentDeadlineCandidates = [
    ...(picksNeeded && nextDeadline
      ? [{ leagueId: id, leagueName: league.name, moduleLabel: nextDeadline.label, iso: nextDeadline.iso }]
      : []),
    ...otherLeagues
      .filter((l) => l.picksDue && l.nextDeadline)
      .map((l) => ({ leagueId: l.id, leagueName: l.name, moduleLabel: l.nextDeadline!.label, iso: l.nextDeadline!.iso })),
  ].sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
  const urgentDeadline = urgentDeadlineCandidates[0] ?? null;

  const recentActivity = [
    ...(danceCardOn ? latestEliminatedNames.map((name) => `${name} eliminated — ${league.name}`) : []),
    ...otherLeagues.flatMap((l) =>
      l.danceCardOn ? latestEliminatedNames.map((name) => `${name} eliminated — ${l.name}`) : []
    ),
    ...(currentTookLead ? [`${league.name}: you took the points lead`] : []),
    ...otherLeagues.filter((l) => l.tookLead).map((l) => `${l.name}: you took the points lead`),
    ...currentRecentJoins
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
      .map((j) => `${j.name} joined ${league.name}`),
    ...otherLeagues
      .flatMap((l) => l.recentJoins.map((j) => ({ ...j, leagueName: l.name })))
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
      .map((j) => `${j.name} joined ${j.leagueName}`),
  ].slice(0, 3);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <LeagueHeader
        leagueId={id}
        leagueName={league.name}
        inviteCode={league.invite_code}
        danceCardOn={danceCardOn}
        waiversOn={league.waiver_mode === "waivers"}
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
        home={<HomeDashboard leagues={homeLeagues} urgentDeadline={urgentDeadline} recentActivity={recentActivity} />}
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
            {danceCardOn &&
              (rosterCouples.length > 0 ? (
                <RosterCard couples={rosterCouples} totalPoints={pointsByManager.get(user.id) ?? 0} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Your Dance Card Roster</CardTitle>
                    <CardDescription>No roster yet — check the draft room.</CardDescription>
                  </CardHeader>
                </Card>
              ))}
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
        thisWeek={
          <WeeklyResultsView
            episodes={completedEpisodes ?? []}
            episodeResults={episodeResults ?? []}
            danceScores={danceScores ?? []}
            danceStyles={danceStyles ?? []}
            couples={flatCouples}
            coupleDisplayNames={Object.fromEntries(allDisplayNames)}
            nameByManager={nameByManager}
            scoresByEpisode={scoresByEpisode}
            currentUserId={user.id}
          />
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
