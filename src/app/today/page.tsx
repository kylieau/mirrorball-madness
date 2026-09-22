import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { HomeDashboard } from "@/components/home-dashboard";
import { PageHeader } from "@/components/page-header";
import { ScrollRevealBar } from "@/components/scroll-reveal-bar";
import { SlimTopBar, TopBar } from "@/components/top-bar";
import { computeLeagueHomeSummary } from "@/lib/league-home-summary";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { groupEpisodesByWeek, liveCompetitionWeek } from "@/lib/competition-week";
import { computeEpisodeBannerState } from "@/lib/episode-banner";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";

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

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_elimination_week, is_double_elimination_week, is_finale")
      .eq("season_id", activeSeasonId ?? ""),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, theme, status, results_published_at")
      .eq("season_id", activeSeasonId ?? ""),
  ]);
  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const liveWeek = liveCompetitionWeek(groupedWeeks);
  const upcomingEpisode = liveWeek ? { id: liveWeek.id, week_number: liveWeek.week_number } : null;
  const completedWeeks = groupedWeeks
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number)
    .map((week) => ({
      id: week.id,
      week_number: week.week_number,
      results_published_at:
        week.episodes
          .map((episode) => episode.results_published_at)
          .filter((value): value is string => !!value)
          .sort()
          .at(-1) ?? null,
      episodeIds: week.episodes.map((episode) => episode.id),
    }));

  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    activeSeasonId ?? null,
    accountSettingsData.spoilerFreeMode,
    completedWeeks
  );

  const trueLatestCompletedWeek = completedWeeks[0] ?? null;
  const latestCompletedWeekId = cutoff.effectiveLatestEpisode?.id ?? null;
  const latestCompletedResultsPublishedAt = cutoff.effectiveLatestEpisode?.results_published_at ?? null;
  const weeksBehind =
    trueLatestCompletedWeek && trueLatestCompletedWeek.id !== latestCompletedWeekId
      ? trueLatestCompletedWeek.week_number - (cutoff.effectiveLatestEpisode?.week_number ?? 0)
      : 0;

  const RECENT_JOIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const joinCutoffMs = Date.now() - RECENT_JOIN_WINDOW_MS;

  const summaries = await Promise.all(
    leagueRefs.map((league) =>
      computeLeagueHomeSummary(
        supabase,
        user.id,
        league,
        upcomingEpisode ?? null,
        latestCompletedWeekId,
        latestCompletedResultsPublishedAt,
        joinCutoffMs,
        cutoff.allowedEpisodeIds
      )
    )
  );

  // Eliminations are season-global, so this only needs fetching once and
  // applies the same to every Dance-Card league the couple's manager is in.
  let latestEliminatedNames: string[] = [];
  if ((cutoff.effectiveLatestEpisode?.episodeIds.length ?? 0) > 0) {
    const [{ data: episodeResults }, { data: couples }] = await Promise.all([
      supabase
        .from("episode_results")
        .select("couple_id, outcome")
        .in("episode_id", cutoff.effectiveLatestEpisode!.episodeIds),
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
    latestEliminatedNames = (episodeResults ?? [])
      .filter((r) => r.outcome === "eliminated")
      .map((r) => displayNames.get(r.couple_id))
      .filter((parts): parts is NonNullable<typeof parts> => !!parts)
      .map((parts) => formatCoupleName(parts));
  }

  const pendingReveal = cutoff.pendingRevealEpisode
    ? { weekNumber: cutoff.pendingRevealEpisode.week_number }
    : null;

  const leagues = summaries.map((s) => ({
    id: s.id,
    name: s.name,
    rank: s.rank,
    totalMembers: s.totalMembers,
    totalPoints: s.totalPoints,
    picksDue: s.picksDue,
    danceCardOn: s.danceCardOn,
    curtainCallOn: s.curtainCallOn,
    grandFinaleOn: s.grandFinaleOn,
    weeksBehind,
  }));

  const episodeBannerState = computeEpisodeBannerState({
    liveWeek,
    picksModuleOn: leagues.some((l) => l.curtainCallOn),
  });

  const deadlines = summaries
    .filter((s) => s.picksDue && s.nextDeadline)
    .map((s) => ({ leagueId: s.id, leagueName: s.name, iso: s.nextDeadline!.iso }))
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  const recentActivity = [
    ...summaries.flatMap((s) =>
      s.danceCardOn ? latestEliminatedNames.map((name) => `${name} eliminated — ${s.name}`) : []
    ),
    ...summaries.filter((s) => s.tookLead).map((s) => `${s.name}: you took the points lead`),
    ...summaries
      .flatMap((s) => s.recentJoins.map((j) => ({ ...j, leagueName: s.name })))
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
      .map((j) => `${j.name} joined ${j.leagueName}`),
  ].slice(0, 3);

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
          pendingReveal={pendingReveal}
          episodeBanner={episodeBannerState ? { state: episodeBannerState, weeksDone: completedWeeks.length } : null}
        />
      </div>

      <FanBottomNav active="home" leagueId={firstLeagueId} />
    </div>
  );
}
