import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EpisodeCarousel } from "@/components/episode-carousel";
import { adjacentThisWeekWeeks, pastPicksHref } from "@/lib/this-week-carousel";

export function CurtainCallCard({
  leagueId,
  episode,
  weeks,
  children,
}: {
  leagueId: string;
  episode: { id: string; weekNumber: number; theme: string | null } | null;
  weeks: { id: string; weekNumber: number; theme: string | null }[];
  children?: ReactNode;
}) {
  const carouselWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const neighbors = episode ? adjacentThisWeekWeeks(carouselWeeks, episode.id) : { prev: null, next: null };

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week&apos;s picks</CardTitle>
        {episode ? (
          <EpisodeCarousel
            weekNumber={episode.weekNumber}
            theme={episode.theme}
            prevHref={neighbors.prev ? pastPicksHref(leagueId, neighbors.prev.id) : null}
            nextHref={neighbors.next ? pastPicksHref(leagueId, neighbors.next.id) : null}
          />
        ) : (
          <CardDescription>No upcoming episode scheduled yet.</CardDescription>
        )}
      </CardHeader>
      {episode && children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
