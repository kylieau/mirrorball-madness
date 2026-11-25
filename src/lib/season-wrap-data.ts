import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { buildCoupleDisplayNames, formatCoupleName } from "./couple-display";
import { seasonChampions, type SeasonChampions } from "./season-wrap";
import { spoilerSafeCoupleStatus } from "./spoiler-safe-couple-status";
import { loadAllCouples } from "./viewer-season-data";

// The season wrap's podium for this viewer: names only once their cutoff
// reaches the Finale.
export async function loadSeasonChampions(
  supabase: SupabaseClient<Database>,
  seasonId: string | null,
  cutoffWeek: number | null,
  finaleWeekNumber: number | null
): Promise<SeasonChampions | null> {
  const couples = (await loadAllCouples(supabase)).filter((c) => c.season_id === seasonId);
  const names = buildCoupleDisplayNames(
    couples.map((c) => ({ id: c.id, celebrity_name: c.celebrity?.name ?? "Unknown", pro_name: c.pro?.name ?? "Unknown" }))
  );
  return seasonChampions(
    couples.map((c) => {
      const parts = names.get(c.id);
      return {
        status: spoilerSafeCoupleStatus({ status: c.status, eliminationWeek: c.elimination_week }, cutoffWeek, finaleWeekNumber),
        name: parts ? formatCoupleName(parts) : "Unknown",
      };
    })
  );
}

// What the Season page needs beyond the league page's base: the manager's
// Home picks and Grand Finale bracket, and who went home each week.
export async function loadSeasonRecapInputs(
  supabase: SupabaseClient<Database>,
  {
    leagueId,
    managerId,
    weeks,
  }: {
    leagueId: string;
    managerId: string;
    weeks: { id: string; week_number: number; status: string; is_finale: boolean; episodes: { id: string }[] }[];
  }
) {
  const weekNumberById = new Map(weeks.map((w) => [w.id, w.week_number]));
  const weekNumberByEpisode = new Map(weeks.flatMap((w) => w.episodes.map((e) => [e.id, w.week_number] as const)));
  const [{ data: predictions }, { data: results }, { data: bracket }] = await Promise.all([
    supabase.from("predictions").select("week_id, predicted_eliminated_couple_id, predicted_eliminated_couple_id_2").eq("league_id", leagueId).eq("manager_id", managerId),
    supabase.from("episode_results").select("episode_id, couple_id, outcome").in("episode_id", [...weekNumberByEpisode.keys()]).eq("outcome", "eliminated"),
    supabase.from("grand_finale_predictions").select("couple_id, predicted_position").eq("league_id", leagueId).eq("manager_id", managerId),
  ]);
  // Every completed week before the Finale counts, a week nobody went home
  // included, so a Home pick that week is a miss.
  const eliminatedByWeek = new Map<number, Set<string>>(
    weeks.filter((w) => w.status === "completed" && !w.is_finale).map((w) => [w.week_number, new Set<string>()])
  );
  for (const r of results ?? []) {
    const week = weekNumberByEpisode.get(r.episode_id);
    if (week != null) (eliminatedByWeek.get(week) ?? eliminatedByWeek.set(week, new Set()).get(week)!).add(r.couple_id);
  }
  return {
    homePicks: (predictions ?? []).flatMap((p) => {
      const weekNumber = weekNumberById.get(p.week_id);
      return weekNumber == null
        ? []
        : [{ weekNumber, coupleIds: [p.predicted_eliminated_couple_id, p.predicted_eliminated_couple_id_2].filter((id): id is string => !!id) }];
    }),
    eliminatedByWeek,
    bracket: (bracket ?? []).map((b) => ({ coupleId: b.couple_id, position: b.predicted_position })),
  };
}
