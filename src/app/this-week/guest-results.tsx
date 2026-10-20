import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { WeeklyResultsView } from "@/components/weekly-results-view";
import { EpisodeCarousel, ThisWeekThemePeek } from "@/components/episode-carousel";
import { PageHeader } from "@/components/page-header";
import { buildCoupleDisplayNames } from "@/lib/couple-display";
import { loadGuestSeason } from "@/lib/guest-season-data";
import { loadAllCouples } from "@/lib/viewer-season-data";
import {
  adjacentThisWeekWeeks,
  buildThisWeekCarouselWeeks,
  selectThisWeekEpisode,
  thisWeekHref,
} from "@/lib/this-week-carousel";

// Signed-out Results: every published week, no league notes and no live
// reveal (a guest never opted into live scores).
export async function GuestResults({
  supabase,
  weekParam,
}: {
  supabase: SupabaseClient<Database>;
  weekParam?: string;
}) {
  const [{ groupedWeeks, completedWeeks }, { data: danceStyles }, allCouples] = await Promise.all([
    loadGuestSeason(supabase),
    supabase.from("dance_styles").select("id, name").order("name"),
    loadAllCouples(supabase),
  ]);

  const seasonWeeks = groupedWeeks.map((week) => ({
    id: week.id,
    week_number: week.week_number,
    theme: week.theme,
    status: week.status,
    nightsLabel: week.nightsLabel,
    is_finale: week.is_finale,
    episodes: week.episodes,
  }));
  const carouselWeeks = buildThisWeekCarouselWeeks(seasonWeeks, new Set(completedWeeks.map((week) => week.id)));
  const { episode: selectedWeek, mode: selectedMode } = selectThisWeekEpisode(carouselWeeks, weekParam, null);
  const neighbors = selectedWeek ? adjacentThisWeekWeeks(carouselWeeks, selectedWeek.id) : { prev: null, next: null };
  const showResults = selectedMode === "results";
  const selectedEpisodeIds = selectedWeek?.episodes.map((episode) => episode.id) ?? [];

  const [{ data: danceScores }, { data: episodeResults }, { data: inJeopardyRows }] = await Promise.all([
    showResults && selectedEpisodeIds.length > 0
      ? supabase
          .from("dance_scores")
          .select("id, episode_id, couple_id, dance_style_id, song_title, total_score")
          .in("episode_id", selectedEpisodeIds)
      : Promise.resolve({ data: [] }),
    showResults && selectedEpisodeIds.length > 0
      ? supabase.from("episode_results").select("episode_id, couple_id, outcome").in("episode_id", selectedEpisodeIds)
      : Promise.resolve({ data: [] as { episode_id: string; couple_id: string; outcome: string }[] }),
    showResults && selectedEpisodeIds.length > 0
      ? supabase.from("episode_in_jeopardy_couples").select("couple_id").in("episode_id", selectedEpisodeIds)
      : Promise.resolve({ data: [] as { couple_id: string }[] }),
  ]);

  const flatCouples = allCouples.map((c) => ({
    id: c.id,
    celebrity_name: c.celebrity?.name ?? "Unknown",
    pro_name: c.pro?.name ?? "Unknown",
  }));
  const coupleDisplayNames = Object.fromEntries(buildCoupleDisplayNames(flatCouples));

  return (
    <div className="flex flex-col px-4">
      <div className="flex flex-col gap-3 pt-3">
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
        <div className={BOTTOM_NAV_CLEARANCE}>
          {selectedMode === "peek" && selectedWeek ? (
            <ThisWeekThemePeek theme={selectedWeek.theme} />
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
              coupleDisplayNames={coupleDisplayNames}
              pendingReveal={null}
            />
          )}
        </div>
      </div>
      <FanBottomNav active="results" leagueId={null} />
    </div>
  );
}
