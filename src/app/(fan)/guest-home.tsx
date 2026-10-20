import { cn } from "cn";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { BOTTOM_NAV_CLEARANCE, FanBottomNav } from "@/components/bottom-nav";
import { HomeDashboard } from "@/components/home-dashboard";
import { PageHeader } from "@/components/page-header";
import { computeEpisodeBannerState, toBannerWeeks, type EpisodeBannerInput } from "@/lib/episode-banner";
import { buildCoupleDisplayNames, formatCoupleName } from "@/lib/couple-display";
import { buildRecentActivity, type ActivityWeek } from "@/lib/home-activity";
import { loadGuestSeason } from "@/lib/guest-season-data";
import { loadAllCouples } from "@/lib/viewer-season-data";

// Signed-out Home: the season's banner and published results, with a sign-in
// card where Your Leagues would be. Guests have no spoiler marks and never
// opted into live scores, so only officially published weeks show.
export async function GuestHome({ supabase }: { supabase: SupabaseClient<Database> }) {
  const { groupedWeeks, completedWeeks } = await loadGuestSeason(supabase);
  const episodeIds = completedWeeks.flatMap((week) => week.episodes.map((episode) => episode.id));
  const weekNumberByEpisodeId = new Map(
    completedWeeks.flatMap((week) => week.episodes.map((episode) => [episode.id, week.week_number] as const))
  );
  const activityWeeks = new Map<number, ActivityWeek>(
    completedWeeks.map((week) => [week.week_number, { weekNumber: week.week_number, eliminated: [], scores: [] }])
  );

  if (episodeIds.length > 0) {
    const [{ data: episodeResults }, { data: danceScores }, couples] = await Promise.all([
      supabase.from("episode_results").select("episode_id, couple_id, outcome").in("episode_id", episodeIds),
      supabase
        .from("dance_scores")
        .select("episode_id, couple_id, total_score, created_at, dance_styles(name)")
        .in("episode_id", episodeIds),
      loadAllCouples(supabase),
    ]);
    const displayNames = buildCoupleDisplayNames(
      couples.map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "Unknown", pro_name: c.pro?.name ?? "Unknown" }))
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

  const episodeBannerInput: EpisodeBannerInput = {
    weeks: toBannerWeeks(groupedWeeks),
    picksModuleOn: false,
    curtainCallLockAtIso: null,
  };
  const episodeBannerState = computeEpisodeBannerState(episodeBannerInput);
  const westWindow = episodeBannerState?.kind === "west_soon" || episodeBannerState?.kind === "west_watching";
  const recentActivity = buildRecentActivity({
    weeks: [...activityWeeks.values()],
    westWeek: westWindow ? episodeBannerState!.weekNumber : null,
    extraLines: [],
  });

  return (
    <div className="flex flex-col px-4">
      <div className={cn("flex flex-col gap-3 pt-3", BOTTOM_NAV_CLEARANCE)}>
        <PageHeader title="Home" />
        <HomeDashboard
          guest
          leagues={[]}
          recentActivity={recentActivity}
          episodeBanner={{ input: episodeBannerInput, initialState: episodeBannerState }}
        />
      </div>
      <FanBottomNav active="home" leagueId={null} />
    </div>
  );
}
