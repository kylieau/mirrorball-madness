"use client";

import { useState, type ReactNode } from "react";
import {
  submitPredictionToLeagues,
  type LeagueSaveResult,
} from "@/app/leagues/[id]/predictions/actions";
import { AlsoSaveTo, OtherLeagueSaveSummary, UsePicksFrom } from "@/components/other-leagues-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CoupleNameParts } from "@/lib/couple-display";
import { coupleNameNode } from "@/components/couple-name";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";
import { curtainCallPayout } from "@/lib/scoring";
import { adaptCurtainCallPick, defaultSelection, type CurtainCallDestination } from "@/lib/copy-picks";

type Couple = { id: string; celebrity_name: string; pro_name: string };

const CHOOSE_COUPLE = "Choose a couple…";

function CoupleSelect({
  id,
  label,
  value,
  onChange,
  couples,
  nameFor,
  excludeId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (coupleId: string) => void;
  couples: Couple[];
  nameFor: (coupleId: string) => ReactNode;
  excludeId?: string;
}) {
  const options = couples.filter((c) => c.id !== excludeId);
  const items: Record<string, ReactNode> = {
    "": CHOOSE_COUPLE,
    ...Object.fromEntries(options.map((c) => [c.id, nameFor(c.id)])),
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={CHOOSE_COUPLE} />
        </SelectTrigger>
        {/* Default alignItemWithTrigger pins the selected row to the trigger,
            which on a full-cast list covers the rest of the form on a phone. */}
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectItem value="">{CHOOSE_COUPLE}</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {nameFor(c.id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PickEmBox({
  leagueId,
  episode,
  lockAt,
  activeCouples,
  totalCouples,
  eliminationPredictionPoints,
  topScorerPredictionPoints,
  coupleDisplayNames,
  existingPrediction,
  isLocked,
  isDoubleElimination,
  revealedPredictions,
  otherLeagues,
}: {
  leagueId: string;
  episode: { id: string; week_number: number; theme: string | null };
  lockAt: string | null;
  activeCouples: Couple[];
  // Season-wide cast size — for the "N pts · M couples left" preview, not
  // itself spoiler-sensitive (cast size is public). couplesRemaining for
  // that preview reuses activeCouples.length below: the same spoiler-safe
  // count already driving which couples this picker offers.
  totalCouples: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  existingPrediction: {
    predicted_eliminated_couple_id: string | null;
    predicted_eliminated_couple_id_2: string | null;
    predicted_top_scorer_couple_id: string | null;
  } | null;
  isLocked: boolean;
  isDoubleElimination: boolean;
  revealedPredictions?: {
    displayName: string;
    eliminatedLabel: string | null;
    eliminatedLabel2: string | null;
    topScorerLabel: string | null;
  }[];
  otherLeagues: CurtainCallDestination[];
}) {
  const [eliminatedId, setEliminatedId] = useState(
    existingPrediction?.predicted_eliminated_couple_id ?? ""
  );
  // Only read/rendered when isDoubleElimination -- a normal week's
  // eliminatedId behavior above is untouched.
  const [eliminatedId2, setEliminatedId2] = useState(
    existingPrediction?.predicted_eliminated_couple_id_2 ?? ""
  );
  const [topScorerId, setTopScorerId] = useState(
    existingPrediction?.predicted_top_scorer_couple_id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts in read-only "here's what you picked" mode whenever a pick
  // already exists (a fresh page load with a saved prediction) — editing
  // reopens the dropdowns, saving successfully closes them again.
  const [editing, setEditing] = useState(
    !existingPrediction?.predicted_eliminated_couple_id && !existingPrediction?.predicted_top_scorer_couple_id
  );
  const [alsoSaveTo, setAlsoSaveTo] = useState(() => defaultSelection(otherLeagues));
  const [otherResults, setOtherResults] = useState<LeagueSaveResult[]>([]);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const formattedLockAt = useFormattedDeadline(lockAt);

  function nameFor(coupleId: string) {
    const c = activeCouples.find((c) => c.id === coupleId);
    return coupleNameNode(
      coupleDisplayNames[coupleId] ?? { celebrity: c?.celebrity_name ?? "Unknown", pro: c?.pro_name ?? "Unknown" }
    );
  }

  function handleEliminatedChange(slot: 1 | 2, next: string) {
    if (slot === 1) {
      setEliminatedId(next);
      if (next && next === eliminatedId2) setEliminatedId2("");
      return;
    }
    setEliminatedId2(next);
    if (next && next === eliminatedId) setEliminatedId("");
  }

  // On a double-elimination week, submit_prediction enforces "both slots
  // filled or both blank" — mirror that here so Save is disabled on a
  // half-filled state instead of erroring on submit.
  const eliminationPickValid =
    !isDoubleElimination || (!eliminatedId && !eliminatedId2) || (!!eliminatedId && !!eliminatedId2);

  function fillFrom(sourceLeagueId: string) {
    const source = otherLeagues.find((l) => l.id === sourceLeagueId);
    if (!source?.pick) return;
    const pick = adaptCurtainCallPick(source.pick, new Set(activeCouples.map((c) => c.id)));
    setEliminatedId(pick.elim1 ?? "");
    setEliminatedId2(pick.elim2 ?? "");
    setTopScorerId(pick.topScorer ?? "");
    setFilledFrom(source.name);
  }

  async function handleSubmit() {
    setError(null);
    setOtherResults([]);
    setSubmitting(true);
    const results = await submitPredictionToLeagues(
      [leagueId, ...alsoSaveTo],
      episode.id,
      eliminatedId || null,
      isDoubleElimination ? eliminatedId2 || null : null,
      topScorerId || null
    );
    const own = results.find((r) => r.leagueId === leagueId);
    if (own?.error) setError(own.error);
    else setEditing(false);
    setOtherResults(results.filter((r) => r.leagueId !== leagueId));
    setSubmitting(false);
  }

  const hasSavedPick = !!eliminatedId || !!eliminatedId2 || !!topScorerId;
  const lockLine = isLocked
    ? "Predictions are locked for this week."
    : lockAt && formattedLockAt
      ? `Locks at ${formattedLockAt}`
      : null;

  // Same ratio applied server-side at scoring time (computeWeeklyScores in
  // src/lib/scoring.ts) — couplesRemaining reuses activeCouples.length, the
  // same spoiler-safe count already driving this picker's options, so a
  // spoiler-shy manager never sees a preview that reveals more than their
  // own picker does.
  const couplesRemaining = activeCouples.length;
  const eliminationPreview = Math.round(
    curtainCallPayout(eliminationPredictionPoints, couplesRemaining, totalCouples)
  );
  const topScorerPreview = Math.round(
    curtainCallPayout(topScorerPredictionPoints, couplesRemaining, totalCouples)
  );
  const couplesLeftLabel = `${couplesRemaining} couple${couplesRemaining === 1 ? "" : "s"} left`;
  const pickSources = otherLeagues.filter((l) => l.pick);

  return (
    <div className="flex flex-col gap-4">
        {lockLine && <p className="text-sm text-muted-foreground">{lockLine}</p>}
        {isDoubleElimination && !isLocked && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            ⚡ Double Elimination — two couples go home tonight, call &apos;em both.
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <OtherLeagueSaveSummary results={otherResults} destinations={otherLeagues} />

        {!isLocked ? (
          editing ? (
            <>
              {!hasSavedPick && <UsePicksFrom sources={pickSources} onPick={fillFrom} />}
              {filledFrom && (
                <p className="text-xs text-muted-foreground">
                  Filled in from {filledFrom} — review, then save.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Correct elimination: {eliminationPreview} pts · {couplesLeftLabel}
              </p>
              {isDoubleElimination ? (
                <>
                  <CoupleSelect
                    id="eliminated-1"
                    label="Eliminated (1 of 2)"
                    value={eliminatedId}
                    onChange={(v) => handleEliminatedChange(1, v)}
                    couples={activeCouples}
                    nameFor={nameFor}
                    excludeId={eliminatedId2 || undefined}
                  />
                  <CoupleSelect
                    id="eliminated-2"
                    label="Eliminated (2 of 2)"
                    value={eliminatedId2}
                    onChange={(v) => handleEliminatedChange(2, v)}
                    couples={activeCouples}
                    nameFor={nameFor}
                    excludeId={eliminatedId || undefined}
                  />
                </>
              ) : (
                <CoupleSelect
                  id="eliminated"
                  label="Who goes home?"
                  value={eliminatedId}
                  onChange={setEliminatedId}
                  couples={activeCouples}
                  nameFor={nameFor}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Correct top scorer: {topScorerPreview} pts · {couplesLeftLabel}
              </p>
              <CoupleSelect
                id="top-scorer"
                label="Who scores highest?"
                value={topScorerId}
                onChange={setTopScorerId}
                couples={activeCouples}
                nameFor={nameFor}
              />
              <AlsoSaveTo
                destinations={otherLeagues}
                selected={alsoSaveTo}
                onChange={setAlsoSaveTo}
                disabled={submitting}
              />
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={submitting || !eliminationPickValid}>
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
                  <span className="font-medium">
                    {eliminatedId && eliminatedId2 ? (
                      <>
                        {nameFor(eliminatedId)} & {nameFor(eliminatedId2)}
                      </>
                    ) : eliminatedId ? (
                      nameFor(eliminatedId)
                    ) : (
                      "No pick"
                    )}
                  </span>
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
                  {p.eliminatedLabel ?? "—"}
                  {isDoubleElimination && p.eliminatedLabel2 && ` & ${p.eliminatedLabel2}`} /{" "}
                  {p.topScorerLabel ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
