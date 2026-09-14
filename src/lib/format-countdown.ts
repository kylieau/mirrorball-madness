// Pure relative-duration math — unlike absolute date/time display, a
// countdown has no timezone ambiguity, so this is safe to compute directly
// in a Server Component (no client-only hydration guard needed).
export function formatCountdown(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  if (diffMs <= 0) return "locked";

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return "under a minute";

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
