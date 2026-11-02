import { formatEpisodeCasual } from "./format-week";

export type ActivityScore = {
  celebrity: string;
  // The dance style for a judged dance; the special dance's type ("Dance-Off")
  // for a bonus round paid in points.
  danceStyle: string;
  total: number;
  at: string;
  bonus?: boolean;
};

export type ActivityWeek = {
  weekNumber: number;
  eliminated: string[];
  scores: ActivityScore[];
};

export type ActivityDanceRow = {
  episode_id: string;
  couple_id: string;
  total_score: number;
  created_at: string;
  dance_styles: { name: string } | null;
  // Present once the team-dance and special-dances migrations are applied.
  team_id?: string | null;
  max_score?: number | string | null;
};

// A posted row as an activity entry: a bonus round paid in points names its
// special dance's type; every judged dance keeps its style.
export function activityScore(
  row: ActivityDanceRow,
  celebrity: string,
  specialDanceLabels: Record<string, { danceType: string }>
): ActivityScore {
  const total = Number(row.total_score);
  if (row.max_score != null && Number(row.max_score) === 0) {
    const label = row.team_id ? specialDanceLabels[row.team_id]?.danceType : undefined;
    return { celebrity, danceStyle: label?.trim() || "Bonus", total, at: row.created_at, bonus: true };
  }
  return { celebrity, danceStyle: row.dance_styles?.name ?? "Unknown dance", total, at: row.created_at };
}

export type ActivitySegment = { text: string; kind?: "couple" | "manager" | "league" | "score" };
export type ActivityLine = { key: string; segments: ActivitySegment[]; weekLabel: string | null };

// Weeks arrive already limited to what the viewer may see. `westWeek` is the
// week whose West feed is still airing: who went home stays behind a single
// "results are in" line until that window ends, while posted scores still show.
export function buildRecentActivity({
  weeks,
  westWeek,
  extraLines,
}: {
  weeks: ActivityWeek[];
  westWeek: number | null;
  extraLines: ActivitySegment[][];
}): ActivityLine[] {
  const lines: ActivityLine[] = extraLines.map((segments, i) => ({ key: `extra-${i}`, segments, weekLabel: null }));

  for (const week of [...weeks].sort((a, b) => b.weekNumber - a.weekNumber)) {
    const weekLabel = formatEpisodeCasual(week.weekNumber);
    if (week.weekNumber === westWeek && week.eliminated.length > 0) {
      lines.push({ key: `w${week.weekNumber}-hidden`, segments: [{ text: `${weekLabel} results are in` }], weekLabel: null });
    } else {
      week.eliminated.forEach((name, i) =>
        lines.push({ key: `w${week.weekNumber}-elim-${i}`, segments: [{ text: name, kind: "couple" }, { text: " eliminated" }], weekLabel })
      );
    }
    [...week.scores]
      .sort((a, b) => b.at.localeCompare(a.at) || b.total - a.total || a.celebrity.localeCompare(b.celebrity))
      .forEach((s, i) =>
        lines.push({
          key: `w${week.weekNumber}-score-${i}`,
          segments: s.bonus
            ? [
                { text: s.celebrity, kind: "couple" },
                { text: " earned " },
                { text: signedTotal(s.total), kind: "score" },
                { text: ` in the ${s.danceStyle}` },
              ]
            : [
                { text: s.celebrity, kind: "couple" },
                { text: " scored " },
                { text: String(s.total), kind: "score" },
                { text: ` on their ${s.danceStyle}` },
              ],
          weekLabel,
        })
      );
  }
  return lines;
}

// Bonus points are a raw judges' unit, not fantasy points, so they keep the
// plain integer or half-point form ("+3", "−0.5").
function signedTotal(total: number): string {
  const magnitude = String(Math.round(Math.abs(total) * 100) / 100);
  return total < 0 ? `−${magnitude}` : `+${magnitude}`;
}
