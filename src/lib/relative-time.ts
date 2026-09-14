// Relative durations ("in 3 hours") are safe to compute server-side, unlike
// absolute timestamps — there's no viewer-timezone ambiguity to cause a
// hydration mismatch (see CLAUDE.md's date/time hydration safety note).
export function formatCountdown(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  if (diffMs <= 0) return "Closed";

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return "Closes in under a minute";

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Closes in ${days}d ${hours}h`;
  if (hours > 0) return `Closes in ${hours}h ${minutes}m`;
  return `Closes in ${minutes}m`;
}
