import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { WeeklyResultsView } from "@/components/weekly-results-view";
import { EpisodeCarousel, ThisWeekThemePeek } from "@/components/episode-carousel";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { getAccountSettingsData } from "@/lib/account-settings-data";
import { resolveSpoilerCutoff } from "@/lib/spoiler-cutoff";
import { isScoringWeek } from "@/lib/format-week";
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
      .select("joined_at, leagues(id, name)")
      .eq("user_id", user.id)
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

  const { data: activeSeasonId } = await supabase.rpc("active_season_id");
  const { data: seasonEpisodeRows } = await supabase
    .from("episodes")
    .select("id, week_number, airs_at, theme, is_finale, status, is_scoring")
    .eq("season_id", activeSeasonId ?? "")
    .eq("is_scoring", true)
    .order("week_number", { ascending: false });

  const seasonEpisodes = (seasonEpisodeRows ?? []).filter(isScoringWeek);
  const completedEpisodes = seasonEpisodes.filter((e) => e.status === "completed");

  const cutoff = await resolveSpoilerCutoff(
    supabase,
    user.id,
    activeSeasonId ?? null,
    accountSettingsData.spoilerFreeMode,
    completedEpisodes
  );

  // Carousel = spoiler-visible completed weeks + upcoming/locked for a
  // theme peek. ?week= honors that list; an unrecognized or unwatched
  // completed id falls back instead of leaking results.
  const carouselWeeks = buildThisWeekCarouselWeeks(seasonEpisodes, cutoff.allowedEpisodeIds);
  const { episode: selectedEpisode, mode: selectedMode } = selectThisWeekEpisode(carouselWeeks, weekParam);
  const selectedEpisodeId = selectedEpisode?.id ?? null;
  const neighbors = selectedEpisodeId ? adjacentThisWeekWeeks(carouselWeeks, selectedEpisodeId) : { prev: null, next: null };
  const showResults = selectedMode === "results";

  // Fires whenever a completed week sits past last_watched_week — even
  // if an older week is already on screen. Otherwise a viewer who marked
  // Week 1 gets stranded on those results with no way to reveal Week 2.
  const pendingReveal = cutoff.pendingRevealEpisode
    ? { weekNumber: cutoff.pendingRevealEpisode.week_number, theme: cutoff.pendingRevealEpisode.theme }
    : null;

  const [{ data: danceScores }, { data: episodeResults }, { data: danceStyles }, { data: allCouples }] =
    await Promise.all([
      showResults && selectedEpisodeId
        ? supabase.from("dance_scores").select("id, episode_id, couple_id, dance_style_id, total_score").eq("episode_id", selectedEpisodeId)
        : Promise.resolve({ data: [] }),
      showResults && selectedEpisodeId
        ? supabase
            .from("episode_results")
            .select("episode_id, couple_id, outcome")
            .eq("episode_id", selectedEpisodeId)
        : Promise.resolve({ data: [] }),
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
      .eq("manager_id", user.id)
      .in("league_id", leagueIds)
      .is("end_week", null),
    showResults && selectedEpisodeId
      ? supabase
          .from("predictions")
          .select("league_id, predicted_eliminated_couple_id, predicted_top_scorer_couple_id")
          .eq("manager_id", user.id)
          .eq("episode_id", selectedEpisodeId)
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
    const lines: string[] = [];
    if (rosterLeaguesByCouple[coupleId]?.length) {
      lines.push(`On your roster in ${rosterLeaguesByCouple[coupleId].join(", ")}`);
    }
    if (eliminationPickLeaguesByCouple[coupleId]?.length) {
      lines.push(`Your elimination pick in ${eliminationPickLeaguesByCouple[coupleId].join(", ")}`);
    }
    if (topScorerPickLeaguesByCouple[coupleId]?.length) {
      lines.push(`Your top-scorer pick in ${topScorerPickLeaguesByCouple[coupleId].join(", ")}`);
    }
    leaguesByCouple[coupleId] = lines;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TopBar {...accountSettingsData} email={user.email ?? ""} />

      <div className={BOTTOM_NAV_CLEARANCE}>
        <PageHeader title="Results">
          {selectedEpisode && (
            <EpisodeCarousel
              weekNumber={selectedEpisode.week_number}
              theme={selectedEpisode.theme}
              prevHref={neighbors.prev ? thisWeekHref(neighbors.prev.id) : null}
              nextHref={neighbors.next ? thisWeekHref(neighbors.next.id) : null}
            />
          )}
        </PageHeader>
        {selectedMode === "peek" && selectedEpisode ? (
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
            <ThisWeekThemePeek theme={selectedEpisode.theme} />
          </div>
        ) : (
          <WeeklyResultsView
            episodes={showResults && selectedEpisode ? [selectedEpisode] : []}
            episodeResults={episodeResults ?? []}
            danceScores={danceScores ?? []}
            danceStyles={danceStyles ?? []}
            couples={flatCouples}
            coupleDisplayNames={Object.fromEntries(coupleDisplayNames)}
            leaguesByCouple={leaguesByCouple}
            pendingReveal={pendingReveal}
          />
        )}
      </div>

      <FanBottomNav active="results" leagueId={firstLeagueId} />
    </div>
  );
}
