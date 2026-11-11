import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoupleName } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { formatEpisodeCasualWithTheme } from "@/lib/format-week";

function ArrowSlot({
  href,
  label,
  compact,
  children,
}: {
  href: string | null;
  label: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const sizeClass = compact ? "size-8" : "size-10";
  if (href) {
    return (
      <Button
        render={<Link href={href} />}
        nativeButton={false}
        variant="ghost"
        size="icon-lg"
        className={cn(sizeClass, "shrink-0 text-muted-foreground")}
        aria-label={label}
      >
        {children}
      </Button>
    );
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center text-muted-foreground/30", sizeClass)} aria-hidden>
      {children}
    </span>
  );
}

// Slim ← Week N — theme → control shared by Results and Picks.
// Prev/next are real links so flipping re-renders that week's body.
export function EpisodeCarousel({
  weekNumber,
  theme,
  nightsLabel,
  prevHref,
  nextHref,
  compact,
}: {
  weekNumber: number;
  theme: string | null;
  nightsLabel?: string | null;
  prevHref: string | null;
  nextHref: string | null;
  compact?: boolean;
}) {
  const label = formatEpisodeCasualWithTheme(weekNumber, theme);

  return (
    <nav aria-label="Weeks" className={cn("flex max-w-full items-center", compact ? "justify-start" : "justify-center")}>
      <ArrowSlot href={prevHref} label="Previous week" compact={compact}>
        <ChevronLeftIcon className="size-4" />
      </ArrowSlot>
      <div className={cn("min-w-0 text-center", compact ? "max-w-[calc(100%-4rem)]" : "max-w-[calc(100%-5rem)]")}>
        <p className="truncate text-sm font-medium">{label}</p>
        {nightsLabel && !compact ? (
          <p className="truncate text-[11px] text-muted-foreground">{nightsLabel}</p>
        ) : null}
      </div>
      <ArrowSlot href={nextHref} label="Next week" compact={compact}>
        <ChevronRightIcon className="size-4" />
      </ArrowSlot>
    </nav>
  );
}

export function ThisWeekThemePeek({
  theme,
  lineup = [],
}: {
  theme: string | null;
  // The week's announced dances, once Enter Results has them.
  lineup?: { coupleId: string; parts: CoupleNameParts; dances: string[] }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Results aren&apos;t in yet</CardTitle>
        <CardDescription>
          {theme ? `${theme}. ` : ""}
          {lineup.length > 0 ? "Scores and who went home" : "Dances, scores, and who went home"} land here after the show.
        </CardDescription>
      </CardHeader>
      {lineup.length > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-2.5">
            {lineup.map((entry) => (
              <li key={entry.coupleId} className="flex flex-col text-sm">
                <span>
                  <CoupleName {...entry.parts} />
                </span>
                {entry.dances.map((dance, i) => (
                  <span key={i} className="text-xs text-muted-foreground">
                    {dance}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
