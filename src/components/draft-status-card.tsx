"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { autoPickTrigger, getPickAssignment, secondsRemainingOnClock } from "@/lib/draft";
import { useAutoDraftPick } from "@/lib/use-auto-draft-pick";
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
  currentTurnStartedAt,
  pickTimeLimitSeconds,
  onTheClockAutopilot,
}: {
  leagueId: string;
  draftStatus: string;
  scheduledAt: string | null;
  isCommissioner: boolean;
  memberCount: number;
  pickCount: number;
  onTheClockName: string | null;
  isMyTurn: boolean;
  currentTurnStartedAt: string | null;
  pickTimeLimitSeconds: number;
  onTheClockAutopilot: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (draftStatus !== "in_progress") return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 150); };
    const channel = supabase.channel(`draft-status:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `league_id=eq.${leagueId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leagues", filter: `id=eq.${leagueId}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [leagueId, draftStatus, router]);
  const formattedScheduledAt = useFormattedDeadline(scheduledAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (draftStatus !== "in_progress") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [draftStatus]);

  const secondsRemaining = secondsRemainingOnClock(
    currentTurnStartedAt,
    pickTimeLimitSeconds,
    now
  );
  const clockExpired = secondsRemaining <= 0;

  useAutoDraftPick({
    leagueId,
    turnKey: currentTurnStartedAt,
    draftStatus,
    clockExpired,
    onTheClockAutopilot,
  });

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
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Can&apos;t be there live? Rank your auto-pick queue and turn on autopilot before it starts
            and the draft won&apos;t wait on you. You can still jump in and pick yourself.
          </p>
          <Button
            render={<Link href={`/leagues/${leagueId}/draft`} />}
            nativeButton={false}
            variant={isCommissioner ? "default" : "outline"}
            size="sm"
          >
            {isCommissioner ? "Set Up Draft" : "View Draft Order & Set Auto-Picks"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { round } = getPickAssignment(pickCount + 1, memberCount);
  const pendingAuto = autoPickTrigger({
    draftStatus,
    clockExpired,
    onTheClockAutopilot,
  });

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>Draft is live</CardTitle>
        <CardDescription>
          Round {round} —{" "}
          {isMyTurn ? "it's your turn" : `${onTheClockName ?? "someone"}'s turn`}
          {" · "}
          {pendingAuto ? "Auto-picking…" : `${secondsRemaining}s`}
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
