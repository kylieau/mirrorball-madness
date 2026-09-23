// Fan Results badges. In Jeopardy is a second, additive pill shown alongside
// Safe, never in place of it — an elimination, withdrawal, bye, or podium
// finish keeps its own label regardless of a stale mark on the row.
export function fanOutcomeBadge(outcome: string): { label: string; className: string } {
  if (outcome === "eliminated") return { label: "Eliminated", className: "bg-muted text-muted-foreground" };
  if (outcome === "withdrawn") return { label: "Withdrew", className: "bg-muted text-muted-foreground" };
  if (outcome === "winner") return { label: "Winner", className: "bg-primary/15 text-accent" };
  if (outcome === "runner_up") return { label: "Runner-up", className: "bg-primary/15 text-accent" };
  if (outcome === "third_place") return { label: "Third Place", className: "bg-primary/15 text-accent" };
  if (outcome === "bye") return { label: "DND", className: "bg-muted text-muted-foreground" };
  return { label: "Safe", className: "bg-emerald/20 text-emerald-text" };
}

export const IN_JEOPARDY_BADGE = {
  label: "In Jeopardy",
  className: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
};

// Only a plain Safe outcome ever gets the additional In Jeopardy pill.
export function showInJeopardyBadge(outcome: string, inJeopardy: boolean): boolean {
  return outcome === "safe" && inJeopardy;
}
