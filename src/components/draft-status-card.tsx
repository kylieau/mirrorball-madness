"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPickAssignment } from "@/lib/draft";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";

export function DraftStatusCard({
  leagueId,
  draftStatus,
  scheduledAt,
  isCommissioner,
  memberCount,
  pickCount,
  onTheClockName,
  isMyTurn,
}: {
  leagueId: string;
  draftStatus: string;
  scheduledAt: string | null;
  isCommissioner: boolean;
  memberCount: number;
  pickCount: number;
  onTheClockName: string | null;
  isMyTurn: boolean;
}) {
  const formattedScheduledAt = useFormattedDeadline(scheduledAt);

  if (draftStatus === "completed") return null;

  if (draftStatus === "not_started") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Draft hasn&apos;t started</CardTitle>
          <CardDescription>
            {scheduledAt && formattedScheduledAt
              ? `Scheduled for ${formattedScheduledAt}. `
              : ""}
            {isCommissioner
              ? "Set the draft order and start when your league is ready."
              : "Waiting for your commissioner to start the draft."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            render={<Link href={`/leagues/${leagueId}/draft`} />}
            nativeButton={false}
            variant={isCommissioner ? "default" : "outline"}
            size="sm"
          >
            {isCommissioner ? "Set up draft" : "View draft order"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { round } = getPickAssignment(pickCount + 1, memberCount);

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>Draft is live</CardTitle>
        <CardDescription>
          Round {round} —{" "}
          {isMyTurn ? "it's your turn" : `${onTheClockName ?? "someone"}'s turn`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          render={<Link href={`/leagues/${leagueId}/draft`} />}
          nativeButton={false}
          size="sm"
        >
          {isMyTurn ? "It's your turn — pick now" : "Join draft room"}
        </Button>
      </CardContent>
    </Card>
  );
}
