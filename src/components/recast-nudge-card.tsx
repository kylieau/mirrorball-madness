import Link from "next/link";
import { RecastCatchUpCard } from "@/components/recast-catch-up-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RecastNudgeCard({
  leagueId,
  openSpotCount,
  hiddenOpenSlotCount,
  pendingRevealWeek,
}: {
  leagueId: string;
  // Open spots the viewer can see, counted only while a waiver run is left.
  openSpotCount: number;
  hiddenOpenSlotCount: number;
  pendingRevealWeek: number | null;
}) {
  if (openSpotCount < 1) {
    return hiddenOpenSlotCount > 0 ? <RecastCatchUpCard pendingRevealWeek={pendingRevealWeek} /> : null;
  }

  const picksPath = `/leagues/${leagueId}/picks`;
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>Fill Your Open {openSpotCount === 1 ? "Spot" : "Spots"}</CardTitle>
        <CardDescription>
          {openSpotCount === 1
            ? "You have an open roster spot. Put in a waiver claim to fill it and keep scoring."
            : `You have ${openSpotCount} open roster spots. Put in waiver claims to fill them and keep scoring.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          render={<Link href={`/leagues/${leagueId}/waivers?from=${encodeURIComponent(picksPath)}`} />}
          nativeButton={false}
          size="sm"
        >
          Open Recast
        </Button>
      </CardContent>
    </Card>
  );
}
