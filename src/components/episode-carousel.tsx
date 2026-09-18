import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEpisodeCasualWithTheme } from "@/lib/format-week";

function ArrowSlot({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Button
        render={<Link href={href} />}
        nativeButton={false}
        variant="ghost"
        size="icon-lg"
        className="size-10 shrink-0 text-muted-foreground"
        aria-label={label}
      >
        {children}
      </Button>
    );
  }

  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center text-muted-foreground/30" aria-hidden>
      {children}
    </span>
  );
}

// Slim ← Week N — theme → control shared by Results and Picks.
// Prev/next are real links so flipping re-renders that week's body.
export function EpisodeCarousel({
  weekNumber,
  theme,
  prevHref,
  nextHref,
}: {
  weekNumber: number;
  theme: string | null;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const label = formatEpisodeCasualWithTheme(weekNumber, theme);

  return (
    <nav aria-label="Weeks" className="flex items-center justify-center">
      <ArrowSlot href={prevHref} label="Previous week">
        <ChevronLeftIcon className="size-4" />
      </ArrowSlot>
      <p className="min-w-0 max-w-[calc(100%-5rem)] truncate text-center text-sm font-medium">{label}</p>
      <ArrowSlot href={nextHref} label="Next week">
        <ChevronRightIcon className="size-4" />
      </ArrowSlot>
    </nav>
  );
}

export function ThisWeekThemePeek({ theme }: { theme: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Results aren&apos;t in yet</CardTitle>
        <CardDescription>
          {theme ? `${theme}. ` : ""}Dances, scores, and who went home land here after the show.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
