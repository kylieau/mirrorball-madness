const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// "Today 5 PM PT", "Tomorrow 5 PM PT", "Tuesday 5 PM PT" within the next
// week, "Tue, Oct 6, 5 PM PT" otherwise, past dates included (US zones drop
// daylight/standard). Runs in the viewer's own time zone, so
// call it client-side after mount (see useFormattedDeadline).
export function formatAirsAt(iso: string, now: Date = new Date()): string {
  const airs = new Date(iso);
  const daysAway = Math.round((startOfLocalDay(airs) - startOfLocalDay(now)) / MS_PER_DAY);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    ...(airs.getMinutes() !== 0 ? { minute: "2-digit" as const } : {}),
    timeZoneName: "short",
  })
    .format(airs)
    .replace(/([A-Z])[DS]T$/, "$1T");

  if (daysAway === 0) return `Today ${time}`;
  if (daysAway === 1) return `Tomorrow ${time}`;
  if (daysAway > 1 && daysAway < 7) {
    return `${new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(airs)} ${time}`;
  }
  // The comma keeps "Oct 6 5 PM" from running the day into the hour.
  return `${new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(airs)}, ${time}`;
}
