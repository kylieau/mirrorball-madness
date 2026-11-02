import { collapseToNights, judgeCountForDance } from "./scoring";

export type NightDance = {
  episodeId: string;
  coupleId: string;
  style: string;
  song: string | null;
  totalScore: number;
  scaledScore: number;
};

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

function styleLabel(dance: NightDance, team: boolean): string {
  return `${dance.style}${team ? " (Team)" : ""}`;
}

// One couple's dance lines on a Results card, in the order given. A night
// with one dance keeps the plain "Style · Song" line (its score is the card
// total). A night with several dances shows each dance with its own score,
// then the night total over every mark possible — "Quickstep 28",
// "Freestyle (Team) 36", "Night 64/80" — so the card total reads as one
// night, not a list of unrelated numbers. When a row's panel can't be
// recovered (no marks stored), the night line shows the total only.
export function coupleDanceLines(dances: NightDance[], teamDanceEpisodes: ReadonlySet<string>): string[] {
  const byEpisode = new Map<string, NightDance[]>();
  for (const dance of dances) byEpisode.set(dance.episodeId, [...(byEpisode.get(dance.episodeId) ?? []), dance]);

  const lines: string[] = [];
  for (const [episodeId, night] of byEpisode) {
    const team = teamDanceEpisodes.has(episodeId);
    if (night.length < 2) {
      for (const dance of night) {
        const song = dance.song?.trim();
        lines.push(song ? `${styleLabel(dance, isTeamDance(dance.style, team))} · ${song}` : styleLabel(dance, isTeamDance(dance.style, team)));
      }
      continue;
    }
    for (const dance of night) {
      const song = dance.song?.trim();
      const scored = `${styleLabel(dance, isTeamDance(dance.style, team))} ${trimNumber(dance.totalScore)}`;
      lines.push(song ? `${scored} · ${song}` : scored);
    }
    const [collapsed] = collapseToNights(night);
    const panelKnown = night.every((dance) => judgeCountForDance(dance) !== null);
    lines.push(panelKnown ? `Night ${trimNumber(collapsed.totalScore)}/${collapsed.maxScore}` : `Night ${trimNumber(collapsed.totalScore)}`);
  }
  return lines;
}
