function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// Collapses a long league list into something that still scans at a glance:
// every one of the viewer's leagues -> "all-leagues" (no name dump); 3+ but
// not all -> a count ("3 leagues'") rather than every name; 1-2 -> the names
// themselves, exactly as before.
function leaguePhrase(names: string[], totalLeagueCount: number): string {
  if (totalLeagueCount > 1 && names.length === totalLeagueCount) return "all-leagues";
  if (names.length >= 3) return `${names.length} leagues'`;
  return joinNames(names);
}

function plural(count: number, noun: string): string {
  return count > 1 ? `${noun}s` : noun;
}

// The small "why this couple matters to you" notes on Results, e.g.
// "On your Alpha and Beta rosters". League phrase sits before the noun so
// the note scans by league; the noun pluralizes when several leagues share
// it. totalLeagueCount (the viewer's full league count, not just the ones
// with a stake here) is what lets leaguePhrase collapse to "all-leagues".
export function coupleLeagueNotes({
  rosterLeagues = [],
  eliminationPickLeagues = [],
  topScorerPickLeagues = [],
  grandFinaleNextElimLeagues = [],
  grandFinaleWinnerLeagues = [],
  totalLeagueCount,
}: {
  rosterLeagues?: string[];
  eliminationPickLeagues?: string[];
  topScorerPickLeagues?: string[];
  // Couple sits in the viewer's own Grand Finale "next predicted
  // elimination" slot for these leagues — any week.
  grandFinaleNextElimLeagues?: string[];
  // Couple is the viewer's predicted Grand Finale winner for these leagues —
  // callers should only populate this in semi-final/finale weeks, since a
  // mid-season "predicted winner" isn't a meaningful per-week stake.
  grandFinaleWinnerLeagues?: string[];
  totalLeagueCount: number;
}): string[] {
  const notes: string[] = [];
  if (rosterLeagues.length) {
    notes.push(`On your ${leaguePhrase(rosterLeagues, totalLeagueCount)} ${plural(rosterLeagues.length, "roster")}`);
  }
  if (eliminationPickLeagues.length) {
    notes.push(
      `Your ${leaguePhrase(eliminationPickLeagues, totalLeagueCount)} ${plural(eliminationPickLeagues.length, "elim pick")}`
    );
  }
  if (topScorerPickLeagues.length) {
    notes.push(
      `Your ${leaguePhrase(topScorerPickLeagues, totalLeagueCount)} ${plural(topScorerPickLeagues.length, "top-scorer pick")}`
    );
  }
  if (grandFinaleNextElimLeagues.length) {
    // "bracket next-elim pick", not bare "next-elim pick" — a near-miss of
    // Curtain Call's "elim pick" read as the same thing at a glance, even
    // though one's a one-week call and the other tracks the season-long
    // Grand Finale order. "bracket" carries the distinction.
    notes.push(
      `Your ${leaguePhrase(grandFinaleNextElimLeagues, totalLeagueCount)} ${plural(grandFinaleNextElimLeagues.length, "bracket next-elim pick")}`
    );
  }
  if (grandFinaleWinnerLeagues.length) {
    notes.push(
      `Your ${leaguePhrase(grandFinaleWinnerLeagues, totalLeagueCount)} ${plural(grandFinaleWinnerLeagues.length, "winner pick")}`
    );
  }
  return notes;
}
