// Fan Results badges. In Jeopardy replaces plain Safe only — an elimination,
// withdrawal, bye, or podium finish keeps its own label even if a stale
// mark is still on the row. Exact always wins.
export function fanOutcomeBadge(
  outcome: string,
  inJeopardy: boolean
): { label: string; className: string } {
  if (outcome === "eliminated") return { label: "Eliminated", className: "bg-muted text-muted-foreground" };
  if (outcome === "withdrawn") return { label: "Withdrew", className: "bg-muted text-muted-foreground" };
  if (outcome === "winner") return { label: "Winner", className: "bg-primary/15 text-accent" };
  if (outcome === "runner_up") return { label: "Runner-up", className: "bg-primary/15 text-accent" };
  if (outcome === "third_place") return { label: "Third Place", className: "bg-primary/15 text-accent" };
  if (outcome === "bye") return { label: "DND", className: "bg-muted text-muted-foreground" };
  if (inJeopardy) {
    return { label: "In Jeopardy", className: "bg-amber-500/20 text-amber-800 dark:text-amber-300" };
  }
  return { label: "Safe", className: "bg-emerald/20 text-emerald-text" };
}
