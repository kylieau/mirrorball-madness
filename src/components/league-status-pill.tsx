export function LeagueStatusPill({ picksDue, weeksBehind = 0 }: { picksDue: boolean; weeksBehind?: number }) {
  if (picksDue) {
    return (
      <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
        Picks Due
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
      {weeksBehind > 0 ? `${weeksBehind} wk behind` : "All caught up"}
    </span>
  );
}
