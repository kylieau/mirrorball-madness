import { redirect } from "next/navigation";
import { cn } from "cn";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { HomeDashboard } from "@/components/home-dashboard";
import { PageHeader } from "@/components/page-header";
import { StickyTopBar } from "@/components/top-bar";
import { loadHomeLeagueData } from "@/lib/home-league-data";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { computeEpisodeBannerState, toBannerWeeks, type EpisodeBannerInput } from "@/lib/episode-banner";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { activityScore, buildRecentActivity, type ActivityDanceRow, type ActivityWeek } from "@/lib/home-activity";
import { danceScoreColumns, loadSpecialDanceLabels } from "@/lib/episode-teams";
import { HomeSpoilerChrome } from "@/components/spoiler-free-strip";
import { buildLiveAirChrome } from "@/lib/spoiler-free-strip-state";
import { LiveScoresPrompt } from "@/components/live-scores-prompt";
import { HomeDraftChrome } from "@/components/draft-scores-strip";
import type { LeagueTriage } from "@/components/league-triage-card";
import { excludeReleasedCoupleRows, homeStripChoice, unpostedDraftDances } from "@/lib/draft-scores";
import type { ModuleStackInput } from "@/lib/league-triage";
import { loadModuleStackInputs } from "@/lib/league-module-stack-data";
import { RevealAutoRefresh } from "@/components/reveal-auto-refresh";
import { loadAllCouples, loadTeamsMode, loadViewerMemberships } from "@/lib/viewer-season-data";
import { GuestHome } from "./guest-home";

export default async function Home() {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) {
    return <GuestHome supabase={supabase} />;
  }

  const [memberships, accountSettingsData] = await Promise.all([
    loadViewerMemberships(supabase, user.id),
    getAccountSettingsData(supabase, user.id),
  ]);

  const rows = memberships.filter((m) => m.leagues);
  const leagueRefs = rows.map((m) => m.leagues!);

  if (leagueRefs.length === 0) {
    redirect("/leagues");
  }

  const firstLeagueId = leagueRefs[0].id;

  const {
    groupedWeeks,
    cutoff,
    revealing,
    revealingVisible,
    weeksBehind,
    summaries,
    draftContext,
    activeSeasonId,
    finaleWeekNumber,
  } = await loadHomeLeagueData(supabase, user.id, accountSettingsData.spoilerFreeMode, leagueRefs);

  const moduleInputsPending =
    summaries.length > 0
      ? loadModuleStackInputs(supabase, summaries, {
          activeSeasonId,
          spoilerCutoffWeek: cutoff.effectiveLatestEpisode?.week_number ?? null,
          finaleWeekNumber,
        })
      : Promise.resolve(new Map<string, ModuleStackInput>());

  // Results are season-global, so they're fetched once and shared by every league.
  const visibleWeeks = [
    ...cutoff.visibleEpisodes,
    ...(revealing && revealingVisible
      ? [{ id: revealing.week.id, week_number: revealing.week.week_number, episodeIds: revealing.episodeIds }]
      : []),
  ];
  const draftNight = draftContext.night;
  const visibleEpisodeIds = visibleWeeks.flatMap((week) => week.episodeIds);
  const weekNumberByEpisodeId = new Map(
    visibleWeeks.flatMap((week) => week.episodeIds.map((id) => [id, week.week_number] as const))
  );
  const activityWeeks = new Map<number, ActivityWeek>(
    visibleWeeks.map((week) => [week.week_number, { weekNumber: week.week_number, eliminated: [], scores: [] }])
  );
  if (draftNight && !activityWeeks.has(draftNight.weekNumber)) {
    activityWeeks.set(draftNight.weekNumber, { weekNumber: draftNight.weekNumber, eliminated: [], scores: [] });
  }
  const draftEpisodeIds = new Set(draftNight?.episodeIds ?? []);
  if (visibleEpisodeIds.length > 0 || draftEpisodeIds.size > 0) {
    // team_id and max_score are selected only once their migrations are applied.
    const teamsMode = await loadTeamsMode(supabase);
    const [{ data: danceScoreRows }, { data: episodeResults }, specialDanceLabels, couples] = await Promise.all([
      visibleEpisodeIds.length > 0
        ? supabase
            .from("dance_scores")
            .select(danceScoreColumns(teamsMode, "episode_id, couple_id, total_score, created_at, dance_styles(name)", { teamId: true }))
            .in("episode_id", visibleEpisodeIds)
        : Promise.resolve({ data: [] }),
      visibleEpisodeIds.length > 0
        ? supabase.from("episode_results").select("episode_id, couple_id, outcome").in("episode_id", visibleEpisodeIds)
        : Promise.resolve({ data: [] as { episode_id: string; couple_id: string; outcome: string }[] }),
      loadSpecialDanceLabels(supabase, [...visibleEpisodeIds, ...draftEpisodeIds], teamsMode),
      loadAllCouples(supabase),
    ]);
    const danceScores = (danceScoreRows ?? []) as unknown as ActivityDanceRow[];
    const displayNames = buildCoupleDisplayNames(
      couples.map((c) => ({
        id: c.id,
        celebrity_name: c.celebrity?.name ?? "Unknown",
        pro_name: c.pro?.name ?? "Unknown",
      }))
    );
    for (const r of episodeResults ?? []) {
      const parts = displayNames.get(r.couple_id);
      const week = activityWeeks.get(weekNumberByEpisodeId.get(r.episode_id) ?? -1);
      if (r.outcome === "eliminated" && parts && week) week.eliminated.push({ coupleId: r.couple_id, name: formatCoupleName(parts) });
    }
    const liveDanceScores = excludeReleasedCoupleRows(danceScores, draftNight?.releasedCoupleIdsByEpisode ?? {});
    for (const d of liveDanceScores) {
      const parts = displayNames.get(d.couple_id);
      const week = activityWeeks.get(weekNumberByEpisodeId.get(d.episode_id) ?? -1);
      if (parts && week && d.dance_styles) {
        week.scores.push(activityScore(d, parts.celebrity, specialDanceLabels));
      }
    }
    if (draftNight) {
      const week = activityWeeks.get(draftNight.weekNumber);
      if (week) {
        for (const dance of unpostedDraftDances(draftNight.dances, danceScores.map((d) => d.team_id))) {
          const parts = displayNames.get(dance.coupleId);
          if (parts) {
            week.scores.push(
              activityScore(
                {
                  episode_id: dance.episodeId,
                  couple_id: dance.coupleId,
                  total_score: dance.total,
                  created_at: dance.at,
                  dance_styles: { name: dance.danceStyle },
                  team_id: dance.teamId,
                  max_score: dance.maxScore,
                },
                parts.celebrity,
                specialDanceLabels
              )
            );
          }
        }
      }
    }
  }

  for (const summary of summaries) {
    for (const { weekNumber, ...move } of summary.rankMoves) {
      const week = activityWeeks.get(weekNumber);
      if (week) (week.rankMoves ??= []).push({ league: summary.name, ...move });
    }
  }

  const bannerWeeks = toBannerWeeks(groupedWeeks);
  const { strip: spoilerFreeStrip, prompt: livePrompt, refreshWindows } = buildLiveAirChrome({
    spoilerFreeMode: accountSettingsData.spoilerFreeMode,
    lastWatchedWeek: cutoff.lastWatchedWeek ?? 0,
    completedWeekNumbers: groupedWeeks.filter((week) => week.status === "completed").map((week) => week.week_number),
    revealingWeekNumber: revealing?.week.week_number ?? null,
    pendingRevealWeekNumber: cutoff.pendingRevealEpisode?.week_number ?? null,
    draftContext,
    bannerWeeks,
  });
  const draftVisible = homeStripChoice(!!draftNight, !!spoilerFreeStrip) === "draft";

  const moduleInputs = await moduleInputsPending;
  const leagues: LeagueTriage[] = summaries.map((s, i) => ({
    id: s.id,
    name: s.name,
    isCommissioner: rows[i].role === "commissioner",
    rank: s.rank,
    totalMembers: s.totalMembers,
    totalPoints: s.totalPoints,
    picksDue: s.picksDue,
    weeksBehind,
    settingsFrom: "/",
    modules: moduleInputs.get(s.id)!,
  }));

  const episodeBannerInput: EpisodeBannerInput = {
    weeks: bannerWeeks,
    picksModuleOn: summaries.some((s) => s.curtainCallOn),
    curtainCallLockAtIso:
      summaries
        .flatMap((s) => (s.curtainCallLockAt ? [s.curtainCallLockAt] : []))
        .sort()
        .at(-1) ?? null,
  };
  const episodeBannerState = computeEpisodeBannerState(episodeBannerInput);

  const westWindow = episodeBannerState?.kind === "west_soon" || episodeBannerState?.kind === "west_watching";

  const recentActivity = buildRecentActivity({
    weeks: [...activityWeeks.values()],
    westWeek: westWindow ? episodeBannerState!.weekNumber : null,
    extraLines: [
      ...summaries
        .flatMap((s) => s.recentJoins.map((j) => ({ ...j, leagueName: s.name })))
        .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
        .map((j) => [
          { text: j.name, kind: "manager" as const },
          { text: " joined " },
          { text: j.leagueName, kind: "league" as const },
        ]),
    ],
  });

  const dashboard = (
    <HomeDashboard
      leagues={leagues}
      recentActivity={recentActivity}
      episodeBanner={{ input: episodeBannerInput, initialState: episodeBannerState }}
    />
  );

  return (
    <div className="flex flex-col px-4">
      {draftVisible ? (
        <>
          <HomeDraftChrome {...accountSettingsData} email={user.email ?? ""} />
          <div className={cn("flex flex-col gap-3 pt-3", BOTTOM_NAV_CLEARANCE)}>
            <PageHeader title="Home" />
            {dashboard}
          </div>
        </>
      ) : spoilerFreeStrip ? (
        <>
          <HomeSpoilerChrome
            key={`${spoilerFreeStrip.kind}-${spoilerFreeStrip.weekNumber}-${"earlierWeeks" in spoilerFreeStrip ? spoilerFreeStrip.earlierWeeks.join() : ""}`}
            {...accountSettingsData}
            email={user.email ?? ""}
            state={spoilerFreeStrip}
          />
          <div className={cn("flex flex-col gap-3 pt-3", BOTTOM_NAV_CLEARANCE)}>
            <PageHeader title="Home" />
            {dashboard}
          </div>
        </>
      ) : (
        <>
          <StickyTopBar {...accountSettingsData} email={user.email ?? ""} />
          <div className={cn("flex flex-col gap-3 pt-3", BOTTOM_NAV_CLEARANCE)}>
            <PageHeader title="Home" />
            {dashboard}
          </div>
        </>
      )}

      {livePrompt && (
        <LiveScoresPrompt {...livePrompt} spoilerFreeMode={accountSettingsData.spoilerFreeMode} />
      )}
      <RevealAutoRefresh active={!!revealing && revealingVisible} windows={refreshWindows} />
      <FanBottomNav active="home" leagueId={firstLeagueId} />
    </div>
  );
}
