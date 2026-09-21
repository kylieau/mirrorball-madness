import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatPickTimer(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}

export function DraftAwayNote({ pickTimeLimitSeconds }: { pickTimeLimitSeconds: number }) {
  return (
    <Card className="w-full text-left">
      <CardHeader>
        <CardTitle>You don&apos;t have to be here</CardTitle>
        <CardDescription>
          Can&apos;t make the live draft? Set these up below and the draft won&apos;t wait on you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            <span className="font-medium">Build your auto-pick queue.</span> Rank the couples you want.
            Only you can see it.
          </li>
          <li>
            <span className="font-medium">Turn on Sit out / autopilot.</span> If you won&apos;t be
            around, this is the one to switch on: the moment you&apos;re on the clock, you get your
            highest-ranked couple that&apos;s still available (random if your list runs dry).
          </li>
        </ol>
        <p className="text-muted-foreground">
          Skip autopilot and you&apos;re only auto-picked after your {formatPickTimer(pickTimeLimitSeconds)}{" "}
          pick timer runs out, so everyone waits on you every round.
        </p>
        <p className="text-muted-foreground">
          Change your mind? Show up, switch autopilot off in the draft room, and pick live.
        </p>
        <p className="text-xs text-muted-foreground">
          Auto-picks fire from an open draft room, so they need at least one manager in it.
        </p>
      </CardContent>
    </Card>
  );
}
