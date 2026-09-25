import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { RevealAutoRefresh } from "@/components/reveal-auto-refresh";
import { loadRevealingWeek } from "@/lib/revealing-week-data";
import { WeeklyResultsView } from "@/components/weekly-results-view";
import { EpisodeCarousel, ThisWeekThemePeek } from "@/components/episode-carousel";
import { PageHeader } from "@/components/page-header";
import { ScrollRevealBar } from "@/components/scroll-reveal-bar";
import { SlimTopBar, TopBar } from "@/components/top-bar";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { coupleLeagueNotes } from "@/lib/couple-league-notes";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { groupEpisodesByWeek } from "@/lib/competition-week";
import {
  adjacentThisWeekWeeks,
  buildThisWeekCarouselWeeks,
  selectThisWeekEpisode,
  thisWeekHref,
} from "@/lib/this-week-carousel";

export default async function ThisWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: weekParam } = await searchParams;
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
      .select("user_id, joined_at, leagues(id, name)")
      .or(`user_id.eq.${user.id},co_manager_id.eq.${user.id}`)
      .order("joined_at", { ascending: true }),
    getAccountSettingsData(supabase, user.id),
  ]);

  const leagueRefs = (memberships ?? []).map((m) => m.leagues!).filter(Boolean);

  if (leagueRefs.length === 0) {
    redirect("/leagues");
  }

  const firstLeagueId = leagueRefs[0].id;
  const leagueIds = leagueRefs.map((l) => l.id);
  const leagueNameById = new Map(leagueRefs.map((l) => [l.id, l.name]));
  // Each league's team-scoped data (roster, predictions) is keyed to the
  // primary's user_id even when the viewer is a co-manager there.
  const myTeamIds = [...new Set((memberships ?? []).map((m) => m.user_id))];

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const [{ data: weekRows }, { data: episodeRows }] = await Promise.all([
    supabase
      .from("competition_weeks")
      .select("id, week_number, theme, is_finale, is_elimination_week, is_double_elimination_week")
      .eq("season_id", activeSeasonId ?? "")
      .order("week_number", { ascending: false }),
    supabase
      .from("episodes")
      .select("id, episode_number, week_id, airs_at, theme, status")
      .eq("season_id", activeSeasonId ?? ""),
  ]);

  const groupedWeeks = groupEpisodesByWeek(weekRows ?? [], episodeRows ?? []);
  const seasonWeeks = groupedWeeks.map((week) => ({
    id: week.id,
    week_number: week.week_number,
    theme: week.theme,
    status: week.status,
    nightsLabel: week.nightsLabel,
    is_finale: week.is_finale,
    episodes: week.episodes,
  }));
  const completedWeeks = [...seasonWeeks]
    .filter((week) => week.status === "completed")
    .sort((a, b) => b.week_number - a.week_number);

  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    activeSeasonId ?? null,
    accountSettingsData.spoilerFreeMode,
    completedWeeks
  );

  // Carousel = spoiler-visible completed weeks + upcoming/locked for a
  // theme peek. ?week= honors that list; an unrecognized or unwatched
  // completed id falls back instead of leaking results.
  const carouselWeeks = buildThisWeekCarouselWeeks(seasonWeeks, cutoff.allowedEpisodeIds);
  const { revealing, visible: revealingVisible } = await loadRevealingWeek(supabase, groupedWeeks, cutoff);
  const { episode: selectedWeek, mode: selectedMode } = selectThisWeekEpisode(
    carouselWeeks,
    weekParam,
    revealing && revealingVisible ? revealing.week.id : null
  );
  const selectedWeekId = selectedWeek?.id ?? null;
  const neighbors = selectedWeekId ? adjacentThisWeekWeeks(carouselWeeks, selectedWeekId) : { prev: null, next: null };
  const showResults = selectedMode === "results" || selectedMode === "scores";
  const selectedEpisodeIds = selectedWeek?.episodes.map((episode) => episode.id) ?? [];

  const pendingReveal = cutoff.pendingRevealEpisode
    ? { weekNumber: cutoff.pendingRevealEpisode.week_number, theme: cutoff.pendingRevealEpisode.theme }
    : null;

  const [{ data: danceScores }, { data: episodeResults }, { data: inJeopardyRows }, { data: danceStyles }, { data: allCouples }] =
    await Promise.all([
      showResults && selectedEpisodeIds.length > 0
        ? supabase
            .from("dance_scores")
            .select("id, episode_id, couple_id, dance_style_id, song_title, total_score")
            .in("episode_id", selectedEpisodeIds)
        : Promise.resolve({ data: [] }),
      showResults && selectedEpisodeIds.length > 0
        ? supabase
            .from("episode_results")
            .select("episode_id, couple_id, outcome")
            .in("episode_id", selectedEpisodeIds)
        : Promise.resolve({ data: [] as { episode_id: string; couple_id: string; outcome: string }[] }),
      showResults && selectedEpisodeIds.length > 0
        ? supabase
            .from("episode_in_jeopardy_couples")
            .select("couple_id")
            .in("episode_id", selectedEpisodeIds)
        : Promise.resolve({ data: [] as { couple_id: string }[] }),
      supabase.from("dance_styles").select("id, name").order("name"),
      supabase
        .from("couples")
        .select("id, celebrity:people!couples_celebrity_id_fkey(name), pro:people!couples_pro_id_fkey(name)"),
    ]);

  const flatCouples = (allCouples ?? []).map((c) => ({
    id: c.id,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));
  const coupleDisplayNames = buildCoupleDisplayNames(flatCouples);

  // Which of the viewer's own leagues have each couple on their Dance Card
  // roster right now, plus which leagues they picked this couple as this
  // week's elimination/top-scorer call — this is what makes eliminations
  // and safe calls read as personally relevant instead of just generic
  // show news. Picks are looked up against the episode being shown here
  // (whichever week is selected), not the upcoming episode Your Picks deals
  // with — a past call, not a pending one.
  const [{ data: rosterSlots }, { data: pastPredictions }] = await Promise.all([
    supabase
      .from("roster_slots")
      .select("league_id, couple_id")
      .in("manager_id", myTeamIds)
      .in("league_id", leagueIds)
      .is("end_week", null),
    selectedMode === "results" && selectedWeekId
      ? supabase
          .from("predictions")
          .select("league_id, predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
          .in("manager_id", myTeamIds)
          .eq("week_id", selectedWeekId)
          .in("league_id", leagueIds)
      : Promise.resolve({ data: [] }),
  ]);

  const rosterLeaguesByCouple: Record<string, string[]> = {};
  for (const slot of rosterSlots ?? []) {
    if (!slot.couple_id) continue;
    const leagueName = leagueNameById.get(slot.league_id);
    if (!leagueName) continue;
    (rosterLeaguesByCouple[slot.couple_id] ??= []).push(leagueName);
  }

  const eliminationPickLeaguesByCouple: Record<string, string[]> = {};
  const topScorerPickLeaguesByCouple: Record<string, string[]> = {};
  for (const p of pastPredictions ?? []) {
    const leagueName = leagueNameById.get(p.league_id);
    if (!leagueName) continue;
    if (p.predicted_eliminated_couple_id) {
      (eliminationPickLeaguesByCouple[p.predicted_eliminated_couple_id] ??= []).push(leagueName);
    }
    if (p.predicted_top_scorer_couple_id) {
      (topScorerPickLeaguesByCouple[p.predicted_top_scorer_couple_id] ??= []).push(leagueName);
    }
  }

  const leaguesByCouple: Record<string, string[]> = {};
  for (const coupleId of new Set([
    ...Object.keys(rosterLeaguesByCouple),
    ...Object.keys(eliminationPickLeaguesByCouple),
    ...Object.keys(topScorerPickLeaguesByCouple),
  ])) {
    leaguesByCouple[coupleId] = coupleLeagueNotes({
      rosterLeagues: rosterLeaguesByCouple[coupleId],
      eliminationPickLeagues: eliminationPickLeaguesByCouple[coupleId],
      topScorerPickLeagues: topScorerPickLeaguesByCouple[coupleId],
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <ScrollRevealBar
        className="-mb-4"
        bar={
          <SlimTopBar
            {...accountSettingsData}
            email={user.email ?? ""}
            left={
              selectedWeek ? (
                <EpisodeCarousel
                  weekNumber={selectedWeek.week_number}
                  theme={selectedWeek.theme}
                  prevHref={neighbors.prev ? thisWeekHref(neighbors.prev.id) : null}
                  nextHref={neighbors.next ? thisWeekHref(neighbors.next.id) : null}
                  compact
                />
              ) : (
                <span className="font-heading text-lg font-semibold">Results</span>
              )
            }
          />
        }
      >
        <PageHeader title="Results">
          {selectedWeek && (
            <EpisodeCarousel
              weekNumber={selectedWeek.week_number}
              theme={selectedWeek.theme}
              nightsLabel={selectedWeek.nightsLabel}
              prevHref={neighbors.prev ? thisWeekHref(neighbors.prev.id) : null}
              nextHref={neighbors.next ? thisWeekHref(neighbors.next.id) : null}
            />
          )}
        </PageHeader>
      </ScrollRevealBar>

      <div className={BOTTOM_NAV_CLEARANCE}>
        {selectedMode === "peek" && selectedWeek ? (
          <div>
            {pendingReveal && (
              <div className="mb-4">
                <WeeklyResultsView
                  episodes={[]}
                  episodeResults={[]}
                  danceScores={[]}
                  danceStyles={danceStyles ?? []}
                  couples={flatCouples}
                  coupleDisplayNames={Object.fromEntries(coupleDisplayNames)}
                  pendingReveal={pendingReveal}
                />
              </div>
            )}
            <ThisWeekThemePeek theme={selectedWeek.theme} />
          </div>
        ) : (
          <WeeklyResultsView
            episodes={
              showResults && selectedWeek
                ? selectedWeek.episodes.map((episode) => ({
                    id: episode.id,
                    week_number: selectedWeek.week_number,
                    airs_at: episode.airs_at,
                    theme: episode.theme,
                    is_finale: selectedWeek.is_finale,
                  }))
                : []
            }
            episodeResults={episodeResults ?? []}
            inJeopardyCoupleIds={[...new Set((inJeopardyRows ?? []).map((row) => row.couple_id))]}
            danceScores={danceScores ?? []}
            danceStyles={danceStyles ?? []}
            couples={flatCouples}
            coupleDisplayNames={Object.fromEntries(coupleDisplayNames)}
            leaguesByCouple={leaguesByCouple}
            pendingReveal={pendingReveal}
            scoresOnly={selectedMode === "scores"}
          />
        )}
      </div>

      <RevealAutoRefresh active={revealingVisible} />
      <FanBottomNav active="results" leagueId={firstLeagueId} />
    </div>
  );
}
