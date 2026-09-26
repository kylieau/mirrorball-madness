import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { HomeDashboard } from "@/components/home-dashboard";
import { PageHeader } from "@/components/page-header";
import { ScrollRevealBar } from "@/components/scroll-reveal-bar";
import { SlimTopBar, TopBar } from "@/components/top-bar";
import { loadHomeLeagueData } from "@/lib/home-league-data";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { computeEpisodeBannerState, DEFAULT_EPISODE_DURATION_MINUTES, type EpisodeBannerInput } from "@/lib/episode-banner";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { buildRecentActivity, type ActivityWeek } from "@/lib/home-activity";
import type { SpoilerFreeStripState } from "@/components/spoiler-free-strip";
import { RevealAutoRefresh } from "@/components/reveal-auto-refresh";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: memberships }, accountSettingsData] = await Promise.all([
    supabase
      .from("league_members")
      .select("joined_at, leagues(id, name)")
      .or(`user_id.eq.${user.id},co_manager_id.eq.${user.id}`)
      .order("joined_at", { ascending: true }),
    getAccountSettingsData(supabase, user.id),
  ]);

  const leagueRefs = (memberships ?? []).map((m) => m.leagues!).filter(Boolean);

  if (leagueRefs.length === 0) {
    redirect("/leagues");
  }

  const firstLeagueId = leagueRefs[0].id;

  const { groupedWeeks, cutoff, revealing, revealingVisible, weeksBehind, summaries } = await loadHomeLeagueData(
    supabase,
    user.id,
    accountSettingsData.spoilerFreeMode,
    leagueRefs
  );

  // Results are season-global, so they're fetched once and shared by every league.
  const visibleWeeks = [
    ...cutoff.visibleEpisodes,
    ...(revealing && revealingVisible
      ? [{ id: revealing.week.id, week_number: revealing.week.week_number, episodeIds: revealing.episodeIds }]
      : []),
  ];
  const visibleEpisodeIds = visibleWeeks.flatMap((week) => week.episodeIds);
  const weekNumberByEpisodeId = new Map(
    visibleWeeks.flatMap((week) => week.episodeIds.map((id) => [id, week.week_number] as const))
  );
  const activityWeeks = new Map<number, ActivityWeek>(
    visibleWeeks.map((week) => [week.week_number, { weekNumber: week.week_number, eliminated: [], scores: [] }])
  );
  if (visibleEpisodeIds.length > 0) {
    const [{ data: episodeResults }, { data: danceScores }, { data: couples }] = await Promise.all([
      supabase.from("episode_results").select("episode_id, couple_id, outcome").in("episode_id", visibleEpisodeIds),
      supabase
        .from("dance_scores")
        .select("episode_id, couple_id, total_score, created_at, dance_styles(name)")
        .in("episode_id", visibleEpisodeIds),
      supabase
        .from("couples")
        .select("id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"),
    ]);
    const displayNames = buildCoupleDisplayNames(
      (couples ?? []).map((c) => ({
        id: c.id,
        celebrity_name: c.celebrity?.name ?? "Unknown",
        pro_name: c.pro?.name ?? "Unknown",
      }))
    );
    for (const r of episodeResults ?? []) {
      const parts = displayNames.get(r.couple_id);
      const week = activityWeeks.get(weekNumberByEpisodeId.get(r.episode_id) ?? -1);
      if (r.outcome === "eliminated" && parts && week) week.eliminated.push(formatCoupleName(parts));
    }
    for (const d of danceScores ?? []) {
      const parts = displayNames.get(d.couple_id);
      const week = activityWeeks.get(weekNumberByEpisodeId.get(d.episode_id) ?? -1);
      if (parts && week && d.dance_styles) {
        week.scores.push({ celebrity: parts.celebrity, danceStyle: d.dance_styles.name, total: d.total_score, at: d.created_at });
      }
    }
  }

  const unmarkedWeeks = groupedWeeks
    .filter((week) => week.status === "completed" && week.week_number > (cutoff.lastWatchedWeek ?? 0))
    .map((week) => week.week_number)
    .sort((a, b) => a - b);
  const lastWatchedWeek = cutoff.lastWatchedWeek ?? 0;
  const stripWeek =
    revealing && lastWatchedWeek < revealing.week.week_number
      ? { kind: "posting" as const, weekNumber: revealing.week.week_number }
      : cutoff.pendingRevealEpisode
        ? { kind: "ready" as const, weekNumber: cutoff.pendingRevealEpisode.week_number }
        : null;
  const spoilerFreeStrip: SpoilerFreeStripState | null = !accountSettingsData.spoilerFreeMode
    ? null
    : stripWeek
      ? { ...stripWeek, earlierWeeks: unmarkedWeeks.filter((week) => week < stripWeek.weekNumber) }
      : revealing
        ? { kind: "watching", weekNumber: revealing.week.week_number }
        : null;

  const leagues = summaries.map((s) => ({
    id: s.id,
    name: s.name,
    rank: s.rank,
    totalMembers: s.totalMembers,
    totalPoints: s.totalPoints,
    picksDue: s.picksDue,
    curtainCallOn: s.curtainCallOn,
    weeksBehind,
  }));

  const episodeBannerInput: EpisodeBannerInput = {
    weeks: groupedWeeks.map((week) => ({
      weekNumber: week.week_number,
      episodes: week.episodes.map((episode) => ({
        airsAt: episode.airs_at,
        durationMinutes: episode.duration_minutes ?? DEFAULT_EPISODE_DURATION_MINUTES,
        completed: episode.status === "completed",
        publishedAt: episode.results_published_at ?? null,
      })),
    })),
    picksModuleOn: leagues.some((l) => l.curtainCallOn),
    curtainCallLockAtIso:
      summaries
        .flatMap((s) => (s.curtainCallLockAt ? [s.curtainCallLockAt] : []))
        .sort()
        .at(0) ?? null,
  };
  const episodeBannerState = computeEpisodeBannerState(episodeBannerInput);

  const deadlines = summaries
    .filter((s) => s.picksDue && s.nextDeadline)
    .map((s) => ({ leagueId: s.id, leagueName: s.name, iso: s.nextDeadline!.iso }))
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  const westWindow = episodeBannerState?.kind === "west_soon" || episodeBannerState?.kind === "west_watching";
  const autoRefresh = !!revealing || westWindow;

  const recentActivity = buildRecentActivity({
    weeks: [...activityWeeks.values()],
    westWeek: westWindow ? episodeBannerState!.weekNumber : null,
    extraLines: [
      ...summaries.filter((s) => s.tookLead).map((s) => [
        { text: s.name, kind: "league" as const },
        { text: ": you took the points lead" },
      ]),
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <ScrollRevealBar
        className="-mb-4"
        bar={
          <SlimTopBar
            {...accountSettingsData}
            email={user.email ?? ""}
            left={<span className="font-heading text-lg font-semibold">Home</span>}
          />
        }
      >
        <PageHeader title="Home" />
      </ScrollRevealBar>

      <div className={BOTTOM_NAV_CLEARANCE}>
        <HomeDashboard
          leagues={leagues}
          deadlines={deadlines}
          recentActivity={recentActivity}
          spoilerFreeStrip={spoilerFreeStrip}
          episodeBanner={{ input: episodeBannerInput, initialState: episodeBannerState }}
        />
      </div>

      <RevealAutoRefresh active={autoRefresh} />
      <FanBottomNav active="home" leagueId={firstLeagueId} />
    </div>
  );
}
