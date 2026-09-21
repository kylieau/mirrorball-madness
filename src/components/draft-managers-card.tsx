import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Manager = {
  user_id: string;
  draft_position: number | null;
  draft_autopilot: boolean;
  profiles: { display_name: string } | null;
};

export function PresenceDot({ present }: { present: boolean }) {
  return (
    <span
      role="img"
      aria-label={present ? "In the room" : "Not in the room"}
      title={present ? "In the room" : "Not in the room"}
      className={`inline-block size-2 shrink-0 rounded-full ${
        present ? "bg-emerald" : "bg-muted-foreground/40"
      }`}
    />
  );
}

export function DraftManagersCard({
  managers,
  presentIds,
  onTheClockUserId,
  isCommissioner,
  pendingUserId,
  onToggleAutopilot,
}: {
  managers: Manager[];
  presentIds: ReadonlySet<string>;
  onTheClockUserId: string | undefined;
  isCommissioner: boolean;
  pendingUserId: string | null;
  onToggleAutopilot: (userId: string, enabled: boolean) => void;
}) {
  const ordered = [...managers].sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managers</CardTitle>
        <CardDescription>
          {isCommissioner
            ? "Put someone who's stepped away on autopilot."
            : "Green dot means they have the draft open. Auto means the draft picks for them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ordered.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <PresenceDot present={presentIds.has(m.user_id)} />
              <span className={m.user_id === onTheClockUserId ? "font-medium" : undefined}>
                {m.draft_position}. {m.profiles?.display_name ?? "Unknown"}
              </span>
              {m.draft_autopilot && (
                <span
                  title="On autopilot: the draft auto-picks for them"
                  className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Auto
                </span>
              )}
            </span>
            {isCommissioner && (
              <Switch
                checked={m.draft_autopilot}
                disabled={pendingUserId === m.user_id}
                onCheckedChange={(checked) => onToggleAutopilot(m.user_id, checked)}
                aria-label={`Autopilot for ${m.profiles?.display_name ?? "member"}`}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
