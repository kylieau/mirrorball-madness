"use client";

import { useEffect, useState } from "react";

// Reads on the client only, after mount — the server-rendered pass has no
// meaningful browser time zone to report, and computing it during render
// would mismatch the server's SSR output and trigger a hydration error.
export function useBrowserTimeZone(): string {
  const [timeZone, setTimeZone] = useState("");
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return timeZone;
}

// Every deadline/lock-time display in the app uses this — date plus hour
// (minute only when it's not on the hour) and a timezone abbreviation, never
// seconds. Runs client-side so getMinutes()/the formatter's default time
// zone both reflect the viewer's own clock.
export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    ...(d.getMinutes() !== 0 ? { minute: "2-digit" as const } : {}),
    timeZoneName: "short",
  }).format(d);
}

// formatDeadline() defaults to the runtime's own time zone, which differs
// between the server's SSR pass and the browser — calling it directly during
// render triggers a hydration mismatch. This mount-gates it the same way
// useBrowserTimeZone() does, returning "" until the client has settled.
export function useFormattedDeadline(iso: string | null | undefined): string {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    setFormatted(iso ? formatDeadline(iso) : "");
  }, [iso]);
  return formatted;
}

// "Draft saved 3 minutes ago" — same hydration-safety reasoning as
// useFormattedDeadline (the server has no meaningful "now" to diff
// against), plus a periodic re-render so it keeps ticking while the form
// stays open instead of freezing at whatever it read on mount.
export function formatRelativeTimeAgo(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export function useRelativeTimeAgo(iso: string | null): string {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    if (!iso) {
      setFormatted("");
      return;
    }
    const update = () => setFormatted(formatRelativeTimeAgo(iso));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [iso]);
  return formatted;
}

export function airsAtToUtcIso(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Converts an absolute instant into the datetime-local input format (no
// timezone suffix, minute precision) in the viewer's own time zone.
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The show's normal slot: 8pm US Eastern on the next Tuesday (today counts,
// so scheduling on a Tuesday itself defaults to that same night), correctly
// accounting for EST/EDT. Returned in the viewer's own time zone since
// that's what the datetime-local input needs to display the right moment.
export function nextTuesdayAt8pmEasternForInput(): string {
  const now = new Date();

  const nyDateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const daysUntilTuesday = (2 - weekdayIndex[nyDateParts.weekday] + 7) % 7;

  // Guess the UTC instant for "that NY calendar day at 20:00", then correct
  // for whatever DST offset actually applies by checking how the guess reads
  // back in America/New_York and adjusting by the difference.
  const guessUtc = Date.UTC(
    Number(nyDateParts.year),
    Number(nyDateParts.month) - 1,
    Number(nyDateParts.day) + daysUntilTuesday,
    20,
    0,
    0
  );
  const readBack = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(guessUtc)).map((p) => [p.type, p.value])
  );
  const readBackAsUtc = Date.UTC(
    Number(readBack.year),
    Number(readBack.month) - 1,
    Number(readBack.day),
    Number(readBack.hour),
    Number(readBack.minute),
    Number(readBack.second)
  );

  return utcIsoToLocalInput(new Date(guessUtc - (readBackAsUtc - guessUtc)).toISOString());
}
