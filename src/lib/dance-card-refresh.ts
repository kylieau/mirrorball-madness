import type { Database } from "./supabase/types";
import { recombinedTotal, scoringDance, settledBonuses, type LaterDanceCardRow, type PublicationSnapshot } from "./episode-publication";
import { buildWeeklyScoreRows, danceCardPriorWeeks, danceCardWeekRows, type WeeklyScoreRow } from "./weekly-score-rows";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

// What dance_card_snapshot() returns: the season's scoring inputs and every
// stored weekly row of the active season.
export type DanceCardSnapshot = Pick<
  PublicationSnapshot,
  "season" | "episodes" | "weeks" | "couples" | "dances" | "outcomes" | "leagues" | "settings" | "rosters"
> & { weeklyScores: WeeklyScoreRow[]; _revision: string };

// Every stored row of one league with its Dance Card rebuilt from live data
// under `version`; prediction and Grand Finale points stay as stored. A
// published week is scored the way publishing scores it. A week still
// posting is scored the way a v2/v3 reveal scores it, which v1 can't be
// rebuilt from (its stored row is the night's running change).
export type DanceCardVersion = "v1" | "v2" | "v3";

export function danceCardRowsFromLive(
  snapshot: DanceCardSnapshot,
  leagueId: string,
  version: DanceCardVersion
): LaterDanceCardRow[] {
  const league = snapshot.leagues.find((l) => l.id === leagueId);
  const leagueSettings = snapshot.settings.find((s) => s.league_id === leagueId);
  if (!league || !leagueSettings) throw new Error("League not found");
  const settings: Row<"scoring_settings">[] = [{ ...leagueSettings, dance_card_version: version }];
  const stored = snapshot.weeklyScores.filter((row) => row.league_id === leagueId);
  const rows: LaterDanceCardRow[] = [];
  for (const week of [...snapshot.weeks].sort((a, b) => a.week_number - b.week_number)) {
    const storedRows = stored.filter((row) => row.week_id === week.id);
    if (storedRows.length === 0) continue;
    const episodes = snapshot.episodes
      .filter((e) => e.week_id === week.id)
      .sort((a, b) => a.episode_number - b.episode_number);
    const episodeIds = new Set(episodes.map((e) => e.id));
    const dances = snapshot.dances.filter((d) => episodeIds.has(d.episode_id)).map(scoringDance);
    const priorWeeks = danceCardPriorWeeks(snapshot, week.week_number);
    const lastEpisode = episodes.at(-1)!;
    let rebuilt: WeeklyScoreRow[];
    if (episodes.every((e) => e.results_published_at)) {
      const outcomes = snapshot.outcomes.filter((o) => episodeIds.has(o.episode_id));
      rebuilt = buildWeeklyScoreRows(
        {
          episodes: snapshot.episodes,
          dances,
          outcomes,
          jeopardy: [],
          couples: snapshot.couples,
          leagues: [league],
          settings,
          rosters: snapshot.rosters,
          predictions: [],
          lateUnlocks: [],
          grandFinalePredictions: [],
          danceCardPriorWeeks: priorWeeks,
        },
        week,
        lastEpisode.id,
        outcomes
          .filter((o) => o.episode_id === lastEpisode.id)
          .map((o) => ({ couple_id: o.couple_id, outcome: o.outcome, bonus_points: Number(o.bonus_points) }))
      );
    } else {
      if (version === "v1") throw new Error(`Week ${week.week_number} is still posting, so v1 can't be rebuilt now`);
      rebuilt = danceCardWeekRows(
        {
          episodes: snapshot.episodes,
          dances,
          couples: snapshot.couples,
          leagues: [league],
          settings,
          rosters: snapshot.rosters,
          danceCardPriorWeeks: priorWeeks,
          danceCardWeekOutcomes: settledBonuses(snapshot, episodeIds),
        },
        week,
        lastEpisode.id
      );
    }
    const rosterByManager = new Map(rebuilt.map((row) => [row.manager_id, Number(row.roster_points)]));
    for (const row of storedRows) {
      const roster = rosterByManager.get(row.manager_id) ?? 0;
      rows.push({
        league_id: leagueId,
        manager_id: row.manager_id,
        week_id: row.week_id,
        roster_points: roster,
        total_points: recombinedTotal(settings, row, roster),
      });
    }
  }
  return rows;
}

// Stored rows whose Dance Card or total differs from `rows`.
export function danceCardDifferences(
  stored: WeeklyScoreRow[],
  rows: LaterDanceCardRow[]
): { row: LaterDanceCardRow; stored: WeeklyScoreRow | undefined }[] {
  const key = (r: Pick<WeeklyScoreRow, "league_id" | "manager_id" | "week_id">) => `${r.league_id}:${r.manager_id}:${r.week_id}`;
  const storedByKey = new Map(stored.map((r) => [key(r), r]));
  return rows
    .map((row) => ({ row, stored: storedByKey.get(key(row)) }))
    .filter(
      ({ row, stored }) =>
        !stored || Number(stored.roster_points) !== row.roster_points || Number(stored.total_points) !== row.total_points
    );
}
