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
  rosterWeekId,
  invite,
  children,
}: {
  leagueId: string;
  episode: { id: string; weekNumber: number; theme: string | null; nightsLabel?: string | null } | null;
  weeks: { id: string; weekNumber: number; theme: string | null }[];
  rosterWeekId?: string | null;
  // Shown under the title only while this week's picks are open.
  invite?: ReactNode;
  children?: ReactNode;
}) {
  const carouselWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const neighbors = episode ? adjacentThisWeekWeeks(carouselWeeks, episode.id) : { prev: null, next: null };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Weekly Pick &apos;Em</CardTitle>
        {invite ? <CardDescription>{invite}</CardDescription> : null}
        {episode ? (
          <EpisodeCarousel
            weekNumber={episode.weekNumber}
            theme={episode.theme}
            nightsLabel={episode.nightsLabel}
            prevHref={neighbors.prev ? pastPicksHref(leagueId, neighbors.prev.id, rosterWeekId) : null}
            nextHref={neighbors.next ? pastPicksHref(leagueId, neighbors.next.id, rosterWeekId) : null}
          />
        ) : (
          <CardDescription>No upcoming week scheduled yet.</CardDescription>
        )}
      </CardHeader>
      {episode && children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
