import { specialDanceShortName } from "./special-dance-names";

export type NightDance = {
  episodeId: string;
  coupleId: string;
  style: string;
  song: string | null;
  totalScore: number;
  // Null for a legacy row; the marks possible for a special dance scored by
  // marks; 0 for a bonus round scored in points.
  maxScore: number | null;
  // The special dance whose score this row is (entity model); absent or null
  // for the couple's own dance and before the migration is applied.
  teamId?: string | null;
};

// What a fan reader knows about a special dance: its name and type, and
// whether it paid marks or points.
export type SpecialDanceLabelInput = { name: string; danceType: string; scoringMode?: "marks" | "points" };

export const TEAM_DANCE_ROUND_TYPE = "Team Dance";

// Episodes whose round types include Team Dance, from the
// episode_round_types → round_types(name) join shape PostgREST returns.
export function teamDanceEpisodeIds(
  rows: { episode_id: string; round_types: { name: string } | { name: string }[] | null }[]
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const names = Array.isArray(row.round_types) ? row.round_types : row.round_types ? [row.round_types] : [];
    if (names.some((rt) => rt.name === TEAM_DANCE_ROUND_TYPE)) ids.add(row.episode_id);
  }
  return ids;
}

// The team number is the night's Freestyle. Styles are free text an admin
// picks, so "Team Freestyle" counts too.
export function isTeamDance(style: string, episodeHasTeamDance: boolean): boolean {
  return episodeHasTeamDance && /freestyle/i.test(style);
}

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function signed(n: number): string {
  return n < 0 ? `−${trimNumber(-n)}` : `+${trimNumber(n)}`;
}

function isPointsRow(dance: NightDance): boolean {
  return dance.maxScore === 0;
}

// Wherever a night's dances are listed, the couple's own come first, special
// dances under them and a bonus-only row last (Kylie, 2026-11-11), whatever
// order the rows were posted in.
export function orderNightDances<T>(
  dances: T[],
  read: (dance: T) => { maxScore: number | null; teamId?: string | null }
): T[] {
  const rank = (dance: T) => {
    const { maxScore, teamId } = read(dance);
    return Number(maxScore === 0) * 2 + Number(!!teamId);
  };
  return [...dances].sort((a, b) => rank(a) - rank(b));
}

// A row tagged with its special dance reads by the dance's short name
// ("Slaytopia", "Dance-Off 1", "Dance-Off Immunity"), or its kind when the
// name is not readable (a guest before the episode publishes). An untagged
// Freestyle on a Team Dance night keeps the older "(Team)" hint.
function styleLabel(dance: NightDance, team: boolean, labels: ReadonlyMap<string, SpecialDanceLabelInput>): string {
  if (dance.teamId) {
    const label = labels.get(dance.teamId);
    if (!label) return isPointsRow(dance) ? "Bonus" : TEAM_DANCE_ROUND_TYPE;
    return specialDanceShortName({ name: label.name, danceType: label.danceType.trim() || TEAM_DANCE_ROUND_TYPE });
  }
  return `${dance.style}${team ? " (Team)" : ""}`;
}

// One dance's name as fans read it ("Jive", "Slaytopia", "Dance-Off 1"),
// without its song or score.
export function nightDanceLabel(
  dance: NightDance,
  teamDanceEpisodes: ReadonlySet<string>,
  labels: ReadonlyMap<string, SpecialDanceLabelInput>
): string {
  return styleLabel(dance, isTeamDance(dance.style, teamDanceEpisodes.has(dance.episodeId)), labels);
}

function danceLine(dance: NightDance, team: boolean, labels: ReadonlyMap<string, SpecialDanceLabelInput>, alone: boolean): string {
  const label = styleLabel(dance, isTeamDance(dance.style, team), labels);
  // A lone bonus round keeps its points in its line ("Dance-Off · +3"), since
  // the card total is then not a judges' score.
  if (isPointsRow(dance) && dance.teamId) return alone ? `${label} · ${signed(dance.totalScore)}` : label;
  const song = dance.song?.trim();
  return song ? `${label} · ${song}` : label;
}

export type CoupleDanceSummary = {
  // "Style · Song" per dance, with no scores in them.
  lines: string[];
  // On a card with more than one dance, each dance's score for the right
  // column under the card total: marks ("40", "36") and bonus rounds
  // ("+3"), in line order. Null when there is only one part to list, since
  // the card total already is that score.
  parts: { marks: string[]; bonus: string[] } | null;
};

// One couple's dances on a Results card, a night at a time: the lines on the
// left, and the scores that make up the card total on the right ("40 + 40",
// "27 +3 bonus").
export function coupleDanceLines(
  dances: NightDance[],
  teamDanceEpisodes: ReadonlySet<string>,
  labels: ReadonlyMap<string, SpecialDanceLabelInput> = new Map()
): CoupleDanceSummary {
  const byEpisode = new Map<string, NightDance[]>();
  for (const dance of dances) byEpisode.set(dance.episodeId, [...(byEpisode.get(dance.episodeId) ?? []), dance]);
  const ordered = [...byEpisode.values()].flatMap((night) => orderNightDances(night, (dance) => dance));
  const alone = ordered.length < 2;
  const isBonus = (dance: NightDance) => isPointsRow(dance) && !!dance.teamId;
  const marks = ordered.filter((dance) => !isBonus(dance)).map((dance) => trimNumber(dance.totalScore));
  // A dance-off loser's 0 adds nothing to the total, so it is not listed.
  const bonus = ordered.filter((dance) => isBonus(dance) && dance.totalScore !== 0).map((dance) => signed(dance.totalScore));
  return {
    lines: ordered.map((dance) => danceLine(dance, teamDanceEpisodes.has(dance.episodeId), labels, alone)),
    parts: marks.length + bonus.length < 2 ? null : { marks, bonus },
  };
}
