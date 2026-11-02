import { collapseToNights, judgeCountForDance } from "./scoring";

export type NightDance = {
  episodeId: string;
  coupleId: string;
  style: string;
  song: string | null;
  totalScore: number;
  scaledScore: number;
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

// A row tagged with its special dance reads "Team Dance · Slaytopia" (or just
// "Team Dance" when the name is not readable, e.g. a guest before the episode
// publishes); an auto-named entry ("Dance-Off 2") is not repeated after its
// type. An untagged Freestyle on a Team Dance night keeps the older "(Team)"
// hint.
function styleLabel(dance: NightDance, team: boolean, labels: ReadonlyMap<string, SpecialDanceLabelInput>): string {
  if (dance.teamId) {
    const label = labels.get(dance.teamId);
    if (!label) return isPointsRow(dance) ? "Bonus" : TEAM_DANCE_ROUND_TYPE;
    const type = label.danceType.trim() || TEAM_DANCE_ROUND_TYPE;
    if (isPointsRow(dance)) return type;
    return label.name.toLowerCase().startsWith(type.toLowerCase()) ? label.name : `${type} · ${label.name}`;
  }
  return `${dance.style}${team ? " (Team)" : ""}`;
}

function danceLine(dance: NightDance, team: boolean, labels: ReadonlyMap<string, SpecialDanceLabelInput>, withScore: boolean): string {
  const label = styleLabel(dance, isTeamDance(dance.style, team), labels);
  // A bonus round carries its points in the line itself ("Dance-Off · +3"),
  // on a one-dance night too, since the card total is not a judges' score.
  if (isPointsRow(dance) && dance.teamId) return `${label} · ${signed(dance.totalScore)}`;
  const song = dance.song?.trim();
  const scored = withScore ? `${label} ${trimNumber(dance.totalScore)}` : label;
  return song ? `${scored} · ${song}` : scored;
}

// One couple's dance lines on a Results card, in the order given. A night
// with one dance keeps the plain "Style · Song" line (its score is the card
// total). A night with several dances shows each dance with its own score,
// then the night total over every mark possible — "Quickstep 28",
// "Team Dance · Slaytopia 36", "Dance-Off · +3", "Night 67 · 64/80" — so the
// card total reads as one night, not a list of unrelated numbers. When a
// row's panel can't be recovered (no marks stored), the night line shows the
// total only.
export function coupleDanceLines(
  dances: NightDance[],
  teamDanceEpisodes: ReadonlySet<string>,
  labels: ReadonlyMap<string, SpecialDanceLabelInput> = new Map()
): string[] {
  const byEpisode = new Map<string, NightDance[]>();
  for (const dance of dances) byEpisode.set(dance.episodeId, [...(byEpisode.get(dance.episodeId) ?? []), dance]);

  const lines: string[] = [];
  for (const [episodeId, night] of byEpisode) {
    const team = teamDanceEpisodes.has(episodeId);
    if (night.length < 2) {
      for (const dance of night) lines.push(danceLine(dance, team, labels, false));
      continue;
    }
    for (const dance of night) lines.push(danceLine(dance, team, labels, true));
    const [collapsed] = collapseToNights(night);
    const panelKnown = night.every((dance) => dance.maxScore !== null || judgeCountForDance(dance) !== null);
    const marks = collapsed.totalScore - collapsed.bonusScore;
    const nightTotal = trimNumber(collapsed.totalScore);
    if (!panelKnown) lines.push(`Night ${nightTotal}`);
    else if (collapsed.bonusScore !== 0) lines.push(`Night ${nightTotal} · ${trimNumber(marks)}/${collapsed.maxScore}`);
    else lines.push(`Night ${nightTotal}/${collapsed.maxScore}`);
  }
  return lines;
}
