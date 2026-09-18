import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkWeekWatchedButton } from "@/components/mark-week-watched-button";

export function RecastCatchUpCard({ pendingRevealWeek }: { pendingRevealWeek: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You may have an open spot</CardTitle>
        <CardDescription>
          Catch up and mark the latest week as watched to see if you need to recast. We
          won&apos;t name anyone until then.
        </CardDescription>
      </CardHeader>
      {pendingRevealWeek != null && (
        <CardContent>
          <MarkWeekWatchedButton weekNumber={pendingRevealWeek} />
        </CardContent>
      )}
    </Card>
  );
}
