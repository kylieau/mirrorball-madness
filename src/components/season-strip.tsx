import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { formatEpisodeCasualWithTheme } from "@/lib/format-week";
import {
  formatAirDate,
  seasonStripAriaLabel,
  type SeasonStripEpisode,
  type SeasonStripSlots,
} from "@/lib/season-strip";

function Slot({
  label,
  episode,
}: {
  label: string;
  episode: SeasonStripEpisode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{label}</p>
      <p className="mt-0.5 truncate font-heading text-sm font-semibold">
        {formatEpisodeCasualWithTheme(episode.week_number, episode.theme)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatAirDate(episode.airs_at)}</p>
    </div>
  );
}

// Schedule context only — theme and air date, never results/scores/who went
// home. Spoiler-Free pending reveal stays on SpoilerRevealCallout.
export function SeasonStrip({ justAired, upNext }: SeasonStripSlots) {
  if (!justAired && !upNext) return null;

  return (
    <Link
      href="/this-week"
      aria-label={seasonStripAriaLabel({ justAired, upNext })}
      className="mb-4 flex items-center gap-2 rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/30"
    >
      <div className={justAired && upNext ? "grid min-w-0 flex-1 grid-cols-2 gap-3" : "min-w-0 flex-1"}>
        {justAired && <Slot label="Just aired" episode={justAired} />}
        {upNext && <Slot label="Up next" episode={upNext} />}
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
