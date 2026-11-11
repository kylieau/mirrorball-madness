import { collapseToNights, judgeCountForDance, MARK_MAX, type DanceScore } from "./scoring";
import { mergeCoupleOutcomes } from "./competition-week";
import {
  isTeamDance,
  nightDanceLabel,
  orderNightDances,
  type NightDance,
  type SpecialDanceLabelInput,
} from "./night-dance-lines";
import { IMMUNITY_DANCE_TYPE } from "./episode-rounds";
import { specialDanceTypeAndName } from "./special-dance-names";

// A week the viewer may see. "scores" is a week still being revealed: its
// posted dances show, its outcome does not.
export type CoupleHistoryWeekInput = {
  weekNumber: number;
  theme: string | null;
  episodeIds: string[];
  mode: "results" | "scores";
};

export type CoupleHistoryDanceRow = NightDance & { id: string; scaledScore: number };

export type CoupleHistoryDance = {
  id: string;
  label: string;
  // A special dance's name beside its type: "Team Dance" (Slaytopia).
  detail: string | null;
  song: string | null;
  total: number;
  // A bonus round paid in points (max_score 0), shown signed.
  bonus: boolean;
  // Marks possible (judges × 10); null for a bonus round or a dance whose
  // panel can't be recovered.
  possible: number | null;
  // The couple's own dance, not a special dance (or a pre-entity Team Dance
  // Freestyle) whose marks they share.
  own: boolean;
  // An immunity bonus: points the couple got without dancing.
  immunity: boolean;
  marks: { judge: string; score: number }[];
};

export type CoupleHistoryNight = {
  episodeId: string;
  dances: CoupleHistoryDance[];
  // Only on a night with more than one row, where the dance totals alone
  // don't say what the night paid: all marks over all marks possible, then
  // the night on the 30 basis (collapseToNights).
  combined: { total: number; max: number; scaled: number } | null;
  scaled: number;
};

export type CoupleHistoryWeek = {
  weekNumber: number;
  theme: string | null;
  mode: "results" | "scores";
  outcome: string | null;
  inJeopardy: boolean;
  nights: CoupleHistoryNight[];
};

export type CoupleHistory = {
  weeks: CoupleHistoryWeek[];
  danceCount: number;
  average: number | null;
  // The couple's own dance with the largest share of its marks possible, so
  // a 30/30 beats a 38/40; special dances never count (Kylie, 2026-11-05).
  best: { total: number; possible: number; label: string; weekNumber: number } | null;
  jeopardyWeeks: number[];
};

// One couple's season as far as the viewer may see it, newest week first.
// Rows outside the given weeks are dropped, and a week still being revealed
// carries no outcome or In Jeopardy, so a caller can't leak either by
// passing extra rows.
export function buildCoupleHistory(input: {
  coupleId: string;
  weeks: CoupleHistoryWeekInput[];
  dances: CoupleHistoryDanceRow[];
  // Every couple's rows on the same episodes: a night's usual panel (for a
  // legacy or bonus-only night) comes from the whole episode, as in scoring.
  episodeDances: DanceScore[];
  marks: { danceId: string; judge: string; score: number }[];
  outcomes: { episode_id: string; couple_id: string; outcome: string }[];
  inJeopardyEpisodeIds: ReadonlySet<string>;
  teamDanceEpisodes: ReadonlySet<string>;
  labels: ReadonlyMap<string, SpecialDanceLabelInput>;
}): CoupleHistory {
  const marksByDance = new Map<string, { judge: string; score: number }[]>();
  for (const mark of input.marks) {
    marksByDance.set(mark.danceId, [...(marksByDance.get(mark.danceId) ?? []), { judge: mark.judge, score: mark.score }]);
  }

  const nightByEpisode = new Map(
    collapseToNights(input.episodeDances)
      .filter((night) => night.coupleId === input.coupleId)
      .map((night) => [night.episodeId, night])
  );

  const weeks: CoupleHistoryWeek[] = [];
  for (const week of [...input.weeks].sort((a, b) => b.weekNumber - a.weekNumber)) {
    const episodeIds = new Set(week.episodeIds);
    const nights = week.episodeIds.flatMap((episodeId): CoupleHistoryNight[] => {
      const rows = orderNightDances(
        input.dances.filter((dance) => dance.episodeId === episodeId),
        (dance) => dance
      );
      const night = nightByEpisode.get(episodeId);
      if (rows.length === 0 || !night) return [];
      return [
        {
          episodeId,
          dances: rows.map((row) => {
            const special = row.teamId ? input.labels.get(row.teamId) : undefined;
            const named = special ? specialDanceTypeAndName(special) : null;
            return {
              id: row.id,
              possible: row.maxScore === 0 ? null : (row.maxScore ?? (judgeCountForDance(row) ?? 0) * MARK_MAX) || null,
              own: !row.teamId && !isTeamDance(row.style, input.teamDanceEpisodes.has(episodeId)),
              immunity: special?.danceType.trim() === IMMUNITY_DANCE_TYPE,
              label: named?.type ?? nightDanceLabel(row, input.teamDanceEpisodes, input.labels),
              detail: named?.name ?? null,
              song: row.song?.trim() || null,
              total: row.totalScore,
              bonus: row.maxScore === 0 && !!row.teamId,
              marks: [...(marksByDance.get(row.id) ?? [])].sort((a, b) => a.judge.localeCompare(b.judge)),
            };
          }),
          combined: rows.length > 1 ? { total: night.totalScore, max: night.maxScore, scaled: night.scaledScore } : null,
          scaled: night.scaledScore,
        },
      ];
    });
    const results = week.mode === "results";
    const [merged] = results ? mergeCoupleOutcomes(input.outcomes.filter((o) => episodeIds.has(o.episode_id))) : [];
    if (nights.length === 0 && !merged) continue;
    weeks.push({
      weekNumber: week.weekNumber,
      theme: week.theme,
      mode: week.mode,
      outcome: merged?.outcome ?? null,
      inJeopardy: results && week.episodeIds.some((id) => input.inJeopardyEpisodeIds.has(id)),
      nights,
    });
  }

  const nights = weeks.flatMap((week) => week.nights);
  let best: CoupleHistory["best"] = null;
  for (const week of weeks) {
    for (const dance of week.nights.flatMap((night) => night.dances)) {
      if (!dance.own || dance.possible === null) continue;
      if (!best || dance.total / dance.possible > best.total / best.possible) {
        best = { total: dance.total, possible: dance.possible, label: dance.label, weekNumber: week.weekNumber };
      }
    }
  }
  return {
    weeks,
    // Dance-off heats were danced, so they count; an immunity bonus wasn't.
    danceCount: weeks.reduce((sum, week) => sum + week.nights.reduce((n, night) => n + night.dances.filter((d) => !d.immunity).length, 0), 0),
    average: nights.length > 0 ? nights.reduce((sum, night) => sum + night.scaled, 0) / nights.length : null,
    best,
    jeopardyWeeks: weeks.filter((week) => week.inJeopardy).map((week) => week.weekNumber).sort((a, b) => a - b),
  };
}

// The weeks a Spoiler-Free viewer has not marked watched, from the season's
// completed weeks alone, so every couple shows the same range whatever weeks
// they danced.
export function unwatchedRange(lastWatchedWeek: number, latestCompletedWeek: number | null): { from: number; to: number } | null {
  if (latestCompletedWeek === null || latestCompletedWeek <= lastWatchedWeek) return null;
  return { from: lastWatchedWeek + 1, to: latestCompletedWeek };
}
