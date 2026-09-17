"use client";

import { useRef, useState, type TouchEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEpisodeCasualWithTheme } from "@/lib/format-week";
import {
  defaultSeasonStripIndex,
  formatAirDate,
  seasonStripKicker,
  sortSeasonEpisodes,
  type SeasonStripEpisode,
} from "@/lib/season-strip";

const SWIPE_PX = 40;

// Browse-only season timeline. Theme and air date, never results/scores/who
// went home — Spoiler-Free pending reveal stays on SpoilerRevealCallout.
export function SeasonStrip({ episodes }: { episodes: SeasonStripEpisode[] }) {
  const sorted = sortSeasonEpisodes(episodes);
  const [index, setIndex] = useState(() => defaultSeasonStripIndex(sorted));
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  if (sorted.length === 0) return null;

  const atStart = index <= 0;
  const atEnd = index >= sorted.length - 1;
  const current = sorted[index] ?? sorted[0];
  const kicker = seasonStripKicker(current, sorted);
  const showArrows = sorted.length > 1;

  function go(next: number) {
    setIndex(Math.min(sorted.length - 1, Math.max(0, next)));
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(index + (dx < 0 ? 1 : -1));
  }

  return (
    <div
      className="mb-4 flex items-center rounded-xl bg-card ring-1 ring-foreground/10"
      role="region"
      aria-roledescription="carousel"
      aria-label="Season episodes"
    >
      {showArrows && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-10 shrink-0"
          aria-label="Previous episode"
          disabled={atStart}
          onClick={() => go(index - 1)}
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
      )}

      <div
        className="min-w-0 flex-1 overflow-hidden py-3"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {sorted.map((episode) => (
            <div key={episode.id} className="w-full shrink-0 px-1 text-center">
              <p className="h-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {seasonStripKicker(episode, sorted) ?? "\u00a0"}
              </p>
              <p className="mt-0.5 truncate font-heading text-sm font-semibold">
                {formatEpisodeCasualWithTheme(episode.week_number, episode.theme)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatAirDate(episode.airs_at)}</p>
            </div>
          ))}
        </div>
        <span className="sr-only" aria-live="polite">
          {kicker ? `${kicker}. ` : ""}
          {formatEpisodeCasualWithTheme(current.week_number, current.theme)}
          {`, ${formatAirDate(current.airs_at)}`}
        </span>
      </div>

      {showArrows && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-10 shrink-0"
          aria-label="Next episode"
          disabled={atEnd}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon className="size-5" />
        </Button>
      )}
    </div>
  );
}
