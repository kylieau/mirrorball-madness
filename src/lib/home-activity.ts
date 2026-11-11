import { formatPoints } from "./format-points";
import { formatEpisodeCasual } from "./format-week";
import { ordinal } from "./ordinal";
import { IMMUNITY_DANCE_TYPE } from "./episode-rounds";
import { specialDanceShortName } from "./special-dance-names";

export type ActivityScore = {
  coupleId: string;
  celebrity: string;
  // The dance style for a judged dance; the special dance's short name
  // ("Dance-Off 1", "Dance-Off Immunity") for a bonus round paid in points.
  danceStyle: string;
  total: number;
  at: string;
  bonus?: boolean;
  immunity?: boolean;
};

export type ActivityRankMove = { league: string; mover: string; passed: string[]; place: number };

export type ActivityCouple = { coupleId: string; name: string };

// A roster move a league's waiver run made after the week's results: an
// awarded claim, or a trade. A trade side is what one manager sent, the first
// side always sending something.
export type ActivityTransaction =
  | { kind: "waiver"; league: string; manager: string; added: ActivityCouple; dropped: ActivityCouple | null }
  | { kind: "trade"; league: string; sides: { manager: string; couples: ActivityCouple[]; points: number }[] };

export type ActivityWeek = {
  weekNumber: number;
  // The week's outcomes are published, so even a week where nobody went
  // home has results to hold back during the West feed.
  resultsIn?: boolean;
  eliminated: ActivityCouple[];
  scores: ActivityScore[];
  rankMoves?: ActivityRankMove[];
  transactions?: ActivityTransaction[];
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
// special dance by its short name; every judged dance keeps its style.
export function activityScore(
  row: ActivityDanceRow,
  celebrity: string,
  specialDanceLabels: Record<string, { name: string; danceType: string }>
): ActivityScore {
  const total = Number(row.total_score);
  if (row.max_score != null && Number(row.max_score) === 0) {
    const label = row.team_id ? specialDanceLabels[row.team_id] : undefined;
    return {
      coupleId: row.couple_id,
      celebrity,
      danceStyle: label ? specialDanceShortName(label) : "a bonus round",
      total,
      at: row.created_at,
      bonus: true,
      immunity: label?.danceType === IMMUNITY_DANCE_TYPE,
    };
  }
  return { coupleId: row.couple_id, celebrity, danceStyle: row.dance_styles?.name ?? "Unknown dance", total, at: row.created_at };
}

// coupleId: a couple's name opens its history page.
export type ActivitySegment = { text: string; kind?: "couple" | "manager" | "league" | "score"; coupleId?: string };
export type ActivityLine = { key: string; segments: ActivitySegment[]; weekLabel: string | null };

// Weeks arrive already limited to what the viewer may see. `westWeek` is the
// week whose West feed is still airing: who went home stays behind a single
// "results are in" line until that window ends, and so do that week's
// overtakes (published points carry survival and Curtain Call) and roster
// moves, while posted scores still show.
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
    if (week.weekNumber === westWeek && (week.resultsIn || week.eliminated.length > 0)) {
      lines.push({ key: `w${week.weekNumber}-hidden`, segments: [{ text: `${weekLabel} results are in` }], weekLabel: null });
    } else {
      (week.transactions ?? []).forEach((transaction, i) =>
        lines.push({ key: `w${week.weekNumber}-move-${i}`, segments: transactionSegments(transaction), weekLabel })
      );
      // Newest first: the standings moved because of the elimination, which
      // came after the night's scores.
      (week.rankMoves ?? []).forEach((move, i) =>
        lines.push({ key: `w${week.weekNumber}-rank-${i}`, segments: rankMoveSegments(move), weekLabel })
      );
      week.eliminated.forEach(({ coupleId, name }, i) =>
        lines.push({ key: `w${week.weekNumber}-elim-${i}`, segments: [{ text: name, kind: "couple", coupleId }, { text: " eliminated" }], weekLabel })
      );
    }
    // A dance-off loser's 0 earned nothing, so it gets no line (Results leaves
    // it out too).
    [...week.scores.filter((score) => !(score.bonus && score.total === 0))]
      .sort((a, b) => b.at.localeCompare(a.at) || b.total - a.total || a.celebrity.localeCompare(b.celebrity))
      .forEach((s, i) =>
        lines.push({
          key: `w${week.weekNumber}-score-${i}`,
          segments: s.bonus
            ? [
                { text: s.celebrity, kind: "couple", coupleId: s.coupleId },
                { text: " earned " },
                { text: signedTotal(s.total), kind: "score" },
                { text: `${s.immunity ? " with" : " in"} ${s.danceStyle}` },
              ]
            : [
                { text: s.celebrity, kind: "couple", coupleId: s.coupleId },
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

function listSegments(items: ActivitySegment[]): ActivitySegment[] {
  return items.flatMap((item, i) => [
    ...(i === 0 ? [] : [{ text: i === items.length - 1 ? " and " : ", " }]),
    item,
  ]);
}

function managerSegment(name: string): ActivitySegment {
  return { text: name, kind: "manager" };
}

function coupleSegment({ coupleId, name }: ActivityCouple): ActivitySegment {
  return { text: name, kind: "couple", coupleId };
}

function transactionSegments(transaction: ActivityTransaction): ActivitySegment[] {
  const league: ActivitySegment[] = [{ text: " in " }, { text: transaction.league, kind: "league" }];
  if (transaction.kind === "waiver") {
    return [
      managerSegment(transaction.manager),
      { text: " added " },
      coupleSegment(transaction.added),
      ...(transaction.dropped ? [{ text: " and dropped " }, coupleSegment(transaction.dropped)] : []),
      ...league,
    ];
  }
  const { sides } = transaction;
  if (sides.length !== 2) {
    return [...listSegments(sides.map((side) => managerSegment(side.manager))), { text: " made a trade" }, ...league];
  }
  const sent = (side: (typeof sides)[number]) =>
    listSegments([
      ...side.couples.map(coupleSegment),
      ...(side.points > 0 ? [{ text: `${formatPoints(side.points)} pts` }] : []),
    ]);
  const [first, second] = sides;
  const back = sent(second);
  return [
    managerSegment(first.manager),
    { text: " traded " },
    ...sent(first),
    { text: " to " },
    managerSegment(second.manager),
    ...(back.length > 0 ? [{ text: " for " }, ...back] : []),
    ...league,
  ];
}

function rankMoveSegments(move: ActivityRankMove): ActivitySegment[] {
  return [
    managerSegment(move.mover),
    { text: " overtook " },
    ...listSegments(move.passed.map(managerSegment)),
    { text: ` for ${ordinal(move.place)} in ` },
    { text: move.league, kind: "league" },
  ];
}

// Bonus points are a raw judges' unit, not fantasy points, so they keep the
// plain integer or half-point form ("+3", "−0.5").
function signedTotal(total: number): string {
  const magnitude = String(Math.round(Math.abs(total) * 100) / 100);
  return total < 0 ? `−${magnitude}` : `+${magnitude}`;
}
