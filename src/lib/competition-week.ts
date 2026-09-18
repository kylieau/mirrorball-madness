import { formatNightsLabel } from "./format-week";

export type CompetitionWeekRow = {
  id: string;
  week_number: number;
  theme: string | null;
  is_elimination_week: boolean;
  is_double_elimination_week: boolean;
  is_finale: boolean;
};

export type WeekEpisode = {
  id: string;
  episode_number: number;
  week_id: string | null;
  airs_at: string;
  theme: string | null;
  status: string;
  results_published_at?: string | null;
};

export type GroupedCompetitionWeek = {
  id: string;
  week_number: number;
  theme: string | null;
  nightsLabel: string | null;
  status: "upcoming" | "locked" | "completed";
  is_elimination_week: boolean;
  is_double_elimination_week: boolean;
  is_finale: boolean;
  episodes: WeekEpisode[];
  earliestAirsAt: string | null;
};

const OUTCOME_RANK: Record<string, number> = {
  winner: 6,
  runner_up: 5,
  third_place: 4,
  eliminated: 3,
  withdrawn: 3,
  bye: 1,
  safe: 0,
};

export function deriveWeekStatus(
  episodes: { status: string }[]
): "upcoming" | "locked" | "completed" {
  if (episodes.length === 0) return "upcoming";
  if (episodes.every((episode) => episode.status === "completed")) return "completed";
  if (episodes.some((episode) => episode.status === "locked")) return "locked";
  return "upcoming";
}

export function weekTheme(
  week: { theme: string | null },
  episodes: { theme: string | null }[]
): string | null {
  const trimmed = week.theme?.trim();
  if (trimmed) return trimmed;
  if (episodes.length === 1) return episodes[0].theme?.trim() || null;
  return null;
}

export function groupEpisodesByWeek(
  weeks: CompetitionWeekRow[],
  episodes: WeekEpisode[]
): GroupedCompetitionWeek[] {
  const episodesByWeek = new Map<string, WeekEpisode[]>();
  for (const episode of [...episodes].sort(
    (a, b) => a.episode_number - b.episode_number || a.airs_at.localeCompare(b.airs_at)
  )) {
    if (!episode.week_id) continue;
    const list = episodesByWeek.get(episode.week_id) ?? [];
    list.push(episode);
    episodesByWeek.set(episode.week_id, list);
  }

  return [...weeks]
    .sort((a, b) => a.week_number - b.week_number)
    .map((week) => {
      const weekEpisodes = episodesByWeek.get(week.id) ?? [];
      return {
        id: week.id,
        week_number: week.week_number,
        theme: weekTheme(week, weekEpisodes),
        nightsLabel: formatNightsLabel(weekEpisodes.map((episode) => episode.theme)),
        status: deriveWeekStatus(weekEpisodes),
        is_elimination_week: week.is_elimination_week,
        is_double_elimination_week: week.is_double_elimination_week,
        is_finale: week.is_finale,
        episodes: weekEpisodes,
        earliestAirsAt: weekEpisodes[0]?.airs_at ?? null,
      };
    });
}

export function exhibitionEpisodes(episodes: WeekEpisode[]): WeekEpisode[] {
  return [...episodes]
    .filter((episode) => episode.week_id == null)
    .sort((a, b) => a.episode_number - b.episode_number || a.airs_at.localeCompare(b.airs_at));
}

export function liveCompetitionWeek<W extends { status: string }>(weeks: W[]): W | null {
  return weeks.find((week) => week.status !== "completed") ?? null;
}

export function mergeCoupleOutcomes<T extends { couple_id: string; outcome: string }>(rows: T[]): T[] {
  const byCouple = new Map<string, T>();
  for (const row of rows) {
    const prev = byCouple.get(row.couple_id);
    if (!prev || (OUTCOME_RANK[row.outcome] ?? 0) >= (OUTCOME_RANK[prev.outcome] ?? 0)) {
      byCouple.set(row.couple_id, row);
    }
  }
  return [...byCouple.values()];
}

export function episodeIdsForWeek(week: { episodes: { id: string }[] }): string[] {
  return week.episodes.map((episode) => episode.id);
}
