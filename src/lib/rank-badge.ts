const MEDALS = ["🥇", "🥈", "🥉"];
const LAST_PLACE = "🫵🏻🤣";
export const NEUTRAL_BADGE = "🚼";

// Last place always wins over a medal, even when it would otherwise be bronze
// (e.g. a 3-person league) — see the Home rank badge brief.
export function getRankBadge(userPoints: number, allPoints: number[]): string {
  const maxPoints = Math.max(...allPoints);
  const minPoints = Math.min(...allPoints);
  const isLast = userPoints === minPoints && minPoints !== maxPoints;
  if (isLast) return LAST_PLACE;

  const distinctDesc = Array.from(new Set(allPoints)).sort((a, b) => b - a);
  const tier = distinctDesc.indexOf(userPoints);
  if (tier >= 0 && tier < MEDALS.length) return MEDALS[tier];
  return NEUTRAL_BADGE;
}
