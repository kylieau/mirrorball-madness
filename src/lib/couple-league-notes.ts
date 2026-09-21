function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function plural(count: number, noun: string): string {
  return count > 1 ? `${noun}s` : noun;
}

// The small "why this couple matters to you" notes on Results, e.g.
// "On your Alpha and Beta rosters". League name sits before the noun so the
// note scans by league; the noun pluralizes when several leagues share it.
export function coupleLeagueNotes({
  rosterLeagues = [],
  eliminationPickLeagues = [],
  topScorerPickLeagues = [],
}: {
  rosterLeagues?: string[];
  eliminationPickLeagues?: string[];
  topScorerPickLeagues?: string[];
}): string[] {
  const notes: string[] = [];
  if (rosterLeagues.length) {
    notes.push(`On your ${joinNames(rosterLeagues)} ${plural(rosterLeagues.length, "roster")}`);
  }
  if (eliminationPickLeagues.length) {
    notes.push(
      `Your ${joinNames(eliminationPickLeagues)} elimination ${plural(eliminationPickLeagues.length, "pick")}`
    );
  }
  if (topScorerPickLeagues.length) {
    notes.push(
      `Your ${joinNames(topScorerPickLeagues)} top-scorer ${plural(topScorerPickLeagues.length, "pick")}`
    );
  }
  return notes;
}
