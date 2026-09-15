"use client";

import { useState } from "react";
import { submitPrediction } from "@/app/leagues/[id]/predictions/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/chip";
import type { CoupleNameParts } from "@/lib/couple-display";
import { coupleNameNode } from "@/components/couple-name";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";
import { formatEpisodeLabel } from "@/lib/format-week";

type Couple = { id: string; celebrity_name: string; pro_name: string };

export function PickEmBox({
  leagueId,
  episode,
  lockAt,
  activeCouples,
  coupleDisplayNames,
  existingPrediction,
  isLocked,
  revealedPredictions,
}: {
  leagueId: string;
  episode: { id: string; week_number: number } | null;
  lockAt: string | null;
  activeCouples: Couple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  existingPrediction: {
    predicted_eliminated_couple_id: string | null;
    predicted_top_scorer_couple_id: string | null;
  } | null;
  isLocked: boolean;
  revealedPredictions?: {
    displayName: string;
    eliminatedLabel: string | null;
    topScorerLabel: string | null;
  }[];
}) {
  const [eliminatedId, setEliminatedId] = useState(
    existingPrediction?.predicted_eliminated_couple_id ?? ""
  );
  const [topScorerId, setTopScorerId] = useState(
    existingPrediction?.predicted_top_scorer_couple_id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts in read-only "here's what you picked" mode whenever a pick
  // already exists (a fresh page load with a saved prediction) — editing
  // reopens the chip pickers, saving successfully closes them again.
  const [editing, setEditing] = useState(
    !existingPrediction?.predicted_eliminated_couple_id && !existingPrediction?.predicted_top_scorer_couple_id
  );
  const formattedLockAt = useFormattedDeadline(lockAt);

  function nameFor(coupleId: string) {
    const c = activeCouples.find((c) => c.id === coupleId);
    return coupleNameNode(
      coupleDisplayNames[coupleId] ?? { celebrity: c?.celebrity_name ?? "Unknown", pro: c?.pro_name ?? "Unknown" }
    );
  }

  if (!episode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Curtain Call</CardTitle>
          <CardDescription>No upcoming episode scheduled yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await submitPrediction(
      leagueId,
      episode!.id,
      eliminatedId || null,
      topScorerId || null
    );
    if (result.error) setError(result.error);
    else setEditing(false);
    setSubmitting(false);
  }

  const hasSavedPick = !!eliminatedId || !!topScorerId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Curtain Call — {formatEpisodeLabel(episode.week_number)}</CardTitle>
        <CardDescription>
          {isLocked
            ? "Predictions are locked for this episode."
            : lockAt
              ? `Locks at ${formattedLockAt}`
              : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!isLocked ? (
          editing ? (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Who Gets Eliminated?</label>
                <div className="flex flex-wrap gap-2">
                  {activeCouples.map((c) => (
                    <Chip
                      key={c.id}
                      selected={eliminatedId === c.id}
                      onClick={() => setEliminatedId(eliminatedId === c.id ? "" : c.id)}
                    >
                      {nameFor(c.id)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Who Scores Highest?</label>
                <div className="flex flex-wrap gap-2">
                  {activeCouples.map((c) => (
                    <Chip
                      key={c.id}
                      selected={topScorerId === c.id}
                      onClick={() => setTopScorerId(topScorerId === c.id ? "" : c.id)}
                    >
                      {nameFor(c.id)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving..." : "Save prediction"}
                </Button>
                {hasSavedPick && (
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={submitting}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-emerald-text">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/30 text-[10px]">
                  ✓
                </span>
                Picks saved for this week
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Eliminated</span>
                  <span className="font-medium">{eliminatedId ? nameFor(eliminatedId) : "No pick"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Top scorer</span>
                  <span className="font-medium">{topScorerId ? nameFor(topScorerId) : "No pick"}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)}>
                Edit picks
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {revealedPredictions?.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span>{p.displayName}</span>
                <span className="text-muted-foreground">
                  {p.eliminatedLabel ?? "—"} / {p.topScorerLabel ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
