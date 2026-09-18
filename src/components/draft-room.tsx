"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  autoPickTrigger,
  eligibleRemaining,
  getPickAssignment,
  secondsRemainingOnClock,
} from "@/lib/draft";
import { useAutoDraftPick } from "@/lib/use-auto-draft-pick";
import {
  setDraftOrder,
  startDraft,
  makeDraftPick,
  setDraftAutopilot,
  undoLastAutoPick,
} from "@/app/leagues/[id]/draft/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/lib/supabase/types";
import type { CoupleNameParts } from "@/lib/couple-display";
import { CoupleName } from "@/components/couple-name";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";
import { XIcon } from "lucide-react";

type League = Database["public"]["Tables"]["leagues"]["Row"];
type Member = {
  user_id: string;
  role: string;
  draft_position: number | null;
  draft_autopilot: boolean;
  profiles: { display_name: string } | null;
};
type Couple = { id: string; celebrity_name: string; pro_name: string };
type DraftPick = {
  id: string;
  couple_id: string;
  manager_id: string;
  round: number;
  pick_number: number;
  picked_at: string;
  is_auto: boolean;
};

function AutopilotToggle({
  enabled,
  pending,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left">
      <div>
        <p className="text-sm font-medium">Sit out / autopilot</p>
        <p className="text-xs text-muted-foreground">Random picks for the rest of this draft</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={pending || disabled}
      />
    </div>
  );
}

export function DraftRoom({
  league: initialLeague,
  members: initialMembers,
  couples,
  coupleDisplayNames,
  initialPicks,
  currentUserId,
  closeHref,
}: {
  league: League;
  members: Member[];
  couples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  initialPicks: DraftPick[];
  currentUserId: string;
  closeHref: string;
}) {
  const [league, setLeague] = useState(initialLeague);
  const [members, setMembers] = useState(initialMembers);
  const [picks, setPicks] = useState(initialPicks);
  const [pendingCoupleId, setPendingCoupleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autopilotPending, setAutopilotPending] = useState(false);
  const [undoPending, setUndoPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`league-${league.id}-draft`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "draft_picks",
          filter: `league_id=eq.${league.id}`,
        },
        (payload) => {
          const newPick = payload.new as DraftPick;
          setPicks((prev) =>
            prev.some((p) => p.id === newPick.id)
              ? prev
              : [...prev, { ...newPick, is_auto: newPick.is_auto ?? false }].sort(
                  (a, b) => a.pick_number - b.pick_number
                )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "draft_picks",
        },
        (payload) => {
          const oldPick = payload.old as { id?: string };
          if (!oldPick.id) return;
          setPicks((prev) => prev.filter((p) => p.id !== oldPick.id));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leagues",
          filter: `id=eq.${league.id}`,
        },
        (payload) => setLeague(payload.new as League)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "league_members",
          filter: `league_id=eq.${league.id}`,
        },
        (payload) => {
          const updated = payload.new as {
            user_id: string;
            draft_position: number | null;
            draft_autopilot?: boolean;
          };
          setMembers((prev) =>
            prev.map((m) =>
              m.user_id === updated.user_id
                ? {
                    ...m,
                    draft_position: updated.draft_position,
                    draft_autopilot: updated.draft_autopilot ?? m.draft_autopilot,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [league.id]);

  const draftedCoupleIds = useMemo(() => new Set(picks.map((p) => p.couple_id)), [picks]);
  const availableCouples = eligibleRemaining(couples, draftedCoupleIds);
  const totalSlots = members.length * league.roster_size;
  const nextPickNumber = picks.length + 1;
  const { round, draftPosition } = getPickAssignment(
    nextPickNumber,
    members.length,
    league.draft_type as "snake" | "linear"
  );
  const onTheClock = members.find((m) => m.draft_position === draftPosition);
  const isMyTurn = league.draft_status === "in_progress" && onTheClock?.user_id === currentUserId;
  const formattedScheduledAt = useFormattedDeadline(league.draft_scheduled_at);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const secondsRemaining = secondsRemainingOnClock(
    league.current_turn_started_at,
    league.pick_time_limit_seconds,
    now
  );
  const clockExpired = secondsRemaining <= 0;
  const onTheClockAutopilot = onTheClock?.draft_autopilot ?? false;

  useAutoDraftPick({
    leagueId: league.id,
    draftStatus: league.draft_status,
    clockExpired,
    onTheClockAutopilot,
    onError: setError,
  });

  const pendingAuto = autoPickTrigger({
    draftStatus: league.draft_status,
    clockExpired,
    onTheClockAutopilot,
  });

  const isCommissioner = members.some((m) => m.user_id === currentUserId && m.role === "commissioner");
  const myAutopilot = members.find((m) => m.user_id === currentUserId)?.draft_autopilot ?? false;
  const lastPick = picks[picks.length - 1];

  function coupleParts(coupleId: string): CoupleNameParts | null {
    if (coupleDisplayNames[coupleId]) return coupleDisplayNames[coupleId];
    const c = couples.find((c) => c.id === coupleId);
    return c ? { celebrity: c.celebrity_name, pro: c.pro_name } : null;
  }

  function managerLabel(userId: string) {
    return members.find((m) => m.user_id === userId)?.profiles?.display_name ?? "Unknown";
  }

  const [draftOrder, setLocalDraftOrder] = useState<string[]>(() => shuffle(initialMembers.map((m) => m.user_id)));
  const [savingOrder, setSavingOrder] = useState(false);

  function shuffle<T>(arr: T[]) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function moveOrderEntry(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftOrder.length) return;
    const next = [...draftOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setLocalDraftOrder(next);
  }

  async function handleStartDraft() {
    setError(null);
    const { error: orderError } = await setDraftOrder(league.id, draftOrder);
    if (orderError) {
      setError(orderError);
      return;
    }
    const { error } = await startDraft(league.id);
    if (error) setError(error);
  }

  async function handlePick(coupleId: string) {
    setError(null);
    setPendingCoupleId(coupleId);
    const { error } = await makeDraftPick(league.id, coupleId);
    if (error) setError(error);
    setPendingCoupleId(null);
  }

  async function handleAutopilot(enabled: boolean) {
    setError(null);
    setAutopilotPending(true);
    const { error } = await setDraftAutopilot(league.id, enabled);
    if (error) {
      setError(error);
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === currentUserId ? { ...m, draft_autopilot: enabled } : m))
      );
    }
    setAutopilotPending(false);
  }

  async function handleUndoLastAutoPick() {
    setError(null);
    setUndoPending(true);
    const { error } = await undoLastAutoPick(league.id);
    if (error) {
      setError(error);
    } else {
      setPicks((prev) => prev.slice(0, -1));
    }
    setUndoPending(false);
  }

  if (league.draft_status === "not_started") {
    const savedOrder = members
      .filter((m) => m.draft_position !== null)
      .sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0));

    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Link
          href={closeHref}
          aria-label="Close"
          className="self-start text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Draft hasn&apos;t started</h1>
        {league.draft_scheduled_at && (
          <p className="text-sm text-muted-foreground">
            Scheduled for {formattedScheduledAt || "…"}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {isCommissioner ? (
          <>
            <p className="text-sm text-muted-foreground">
              Draft order (drag with the arrows, or leave it shuffled):
            </p>
            <div className="flex w-full flex-col gap-1">
              {draftOrder.map((userId, i) => (
                <div
                  key={userId}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span>
                    {i + 1}. {managerLabel(userId)}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === 0}
                      onClick={() => moveOrderEntry(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === draftOrder.length - 1}
                      onClick={() => moveOrderEntry(i, 1)}
                    >
                      ↓
                    </Button>
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocalDraftOrder(shuffle(draftOrder))}
            >
              Shuffle
            </Button>
            <Button
              onClick={async () => {
                setSavingOrder(true);
                await handleStartDraft();
                setSavingOrder(false);
              }}
              disabled={members.length < 2 || savingOrder}
            >
              Start draft
            </Button>
            {members.length < 2 && (
              <p className="text-xs text-muted-foreground">
                Need at least 2 members to start.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Waiting for the commissioner to start the draft.
            </p>
            {savedOrder.length > 0 && (
              <div className="flex w-full flex-col gap-1 text-left text-sm">
                <p className="text-xs text-muted-foreground">Draft order set by commissioner:</p>
                {savedOrder.map((m) => (
                  <p key={m.user_id}>
                    {m.draft_position}. {m.profiles?.display_name}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <AutopilotToggle
          enabled={myAutopilot}
          pending={autopilotPending}
          disabled={false}
          onToggle={(checked) => {
            void handleAutopilot(checked);
          }}
        />
      </div>
    );
  }

  if (league.draft_status === "completed") {
    const myPicks = picks
      .filter((p) => p.manager_id === currentUserId)
      .sort((a, b) => a.round - b.round);

    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Draft complete!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {league.name} — {members.length} managers, {league.roster_size} rounds, every roster is set
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md bg-emerald/20 px-3 py-2 text-sm font-medium text-emerald-text">
          <span>✓</span>
          Your roster is locked in
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your roster</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {myPicks.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between text-sm">
                <span>
                  {(() => {
                    const parts = coupleParts(p.couple_id);
                    return parts ? <CoupleName {...parts} /> : "Unknown couple";
                  })()}
                </span>
                <span className="text-muted-foreground">
                  Rd {p.round}
                  {p.is_auto ? " · auto · random" : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button render={<Link href={`/leagues/${league.id}`} />} nativeButton={false}>
          Back to {league.name}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{league.name} draft</h1>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          Round {round} · Pick {nextPickNumber} of {totalSlots} —{" "}
          <span className="font-medium text-foreground">
            {isMyTurn ? "Your turn" : `${onTheClock?.profiles?.display_name ?? "..."}'s turn`}
          </span>{" "}
          · {pendingAuto ? "Auto-picking…" : `${secondsRemaining}s`}
        </p>
      </div>

      <AutopilotToggle
        enabled={myAutopilot}
        pending={autopilotPending}
        disabled={false}
        onToggle={(checked) => {
          void handleAutopilot(checked);
        }}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Available Couples</CardTitle>
            <CardDescription>{availableCouples.length} remaining</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {availableCouples.map((c) => (
              <Button
                key={c.id}
                variant="outline"
                className="justify-start"
                disabled={!isMyTurn || pendingCoupleId !== null || myAutopilot}
                onClick={() => handlePick(c.id)}
              >
                <CoupleName {...(coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name })} />
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Draft Board</CardTitle>
            <CardDescription>{picks.length} picks made</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {picks.map((p) => (
              <div key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="text-muted-foreground">#{p.pick_number}</span>
                <span>
                  {(() => {
                    const parts = coupleParts(p.couple_id);
                    return parts ? <CoupleName {...parts} /> : "Unknown couple";
                  })()}
                </span>
                <span className="text-muted-foreground">
                  {managerLabel(p.manager_id)}
                  {p.is_auto ? " · auto · random" : ""}
                </span>
                {isCommissioner && lastPick?.id === p.id && p.is_auto && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={undoPending}
                    onClick={() => void handleUndoLastAutoPick()}
                  >
                    Undo
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
