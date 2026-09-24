import { formatEpisodeCasual } from "./format-week";

export type ActivityWeek = {
  weekNumber: number;
  eliminated: string[];
  scores: { celebrity: string; danceStyle: string; total: number; at: string }[];
};

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
          segments: [
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
