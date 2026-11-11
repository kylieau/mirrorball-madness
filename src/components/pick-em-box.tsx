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
import {
  curtainCallNearMiss2Points,
  curtainCallNearMissPoints,
  curtainCallPayout,
  curtainCallPreviewCopy,
  PODIUM_PLACE_LABELS,
  podiumPreviewCopy,
  type PodiumPick,
} from "@/lib/scoring";
import { adaptCurtainCallPick, defaultSelection, type CurtainCallDestination } from "@/lib/copy-picks";
import { curtainCallPickMade, type CurtainCallPick } from "@/lib/curtain-call-picks";

type Couple = { id: string; celebrity_name: string; pro_name: string };

const CHOOSE_COUPLE = "Choose a couple…";

function CoupleSelect({
  id,
  label,
  value,
  onChange,
  couples,
  nameFor,
  lineup,
  excludeId,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (coupleId: string | null) => void;
  couples: Couple[];
  nameFor: (coupleId: string) => ReactNode;
  lineup: Record<string, string[]>;
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
      <Select items={items} value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={CHOOSE_COUPLE} />
        </SelectTrigger>
        {/* Default alignItemWithTrigger pins the selected row to the trigger,
            which on a full-cast list covers the rest of the form on a phone. */}
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectItem value="">{CHOOSE_COUPLE}</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {/* Only in the open list: the closed trigger reads the name from items. */}
              <span className="flex flex-col">
                <span>{nameFor(c.id)}</span>
                {(lineup[c.id] ?? []).map((dance, i) => (
                  <span key={i} className="text-xs whitespace-normal text-muted-foreground">
                    {dance}
                  </span>
                ))}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const PODIUM_QUESTIONS = ["Who wins the Mirrorball?", "Who finishes second?", "Who finishes third?"];

function SavedPickRows({
  pick,
  isFinale,
  nameFor,
}: {
  pick: CurtainCallPick;
  isFinale: boolean;
  nameFor: (coupleId: string) => ReactNode;
}) {
  const named = (coupleId: string | null) => (coupleId ? nameFor(coupleId) : null);
  const rows = [
    ...(isFinale
      ? PODIUM_PLACE_LABELS.map((label, index) => ({ label, value: named(pick.podium[index]) }))
      : [
          {
            label: "Eliminated",
            value:
              pick.elim1 && pick.elim2 ? (
                <>
                  {nameFor(pick.elim1)} & {nameFor(pick.elim2)}
                </>
              ) : (
                named(pick.elim1)
              ),
          },
        ]),
    { label: "Top Scorer", value: named(pick.topScorer) },
  ];
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium">{row.value ?? "No Pick"}</span>
        </div>
      ))}
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
  categoryWeight = 1,
  nearMissEnabled = true,
  coupleDisplayNames,
  lineup,
  existingPick,
  isLocked,
  isDoubleElimination,
  isFinale,
  otherLeagues,
}: {
  leagueId: string;
  episode: { id: string; week_number: number; theme: string | null };
  lockAt: string | null;
  activeCouples: Couple[];
  // Season-wide cast size — for scaling the payout preview, not itself
  // spoiler-sensitive (cast size is public). couplesRemaining for that
  // preview reuses activeCouples.length below: the same spoiler-safe
  // count already driving which couples this picker offers.
  totalCouples: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  categoryWeight?: number;
  nearMissEnabled?: boolean;
  coupleDisplayNames: Record<string, CoupleNameParts>;
  // This week's announced dances per couple, shown in the dropdowns.
  lineup: Record<string, string[]>;
  existingPick: CurtainCallPick;
  isLocked: boolean;
  isDoubleElimination: boolean;
  // The Finale has no elimination, so the podium takes the elimination pick's place.
  isFinale: boolean;
  otherLeagues: CurtainCallDestination[];
}) {
  // elim2 is only read and rendered on a double-elimination week, podium only
  // in the Finale.
  const [draft, setDraft] = useState(existingPick);
  const [savedPick, setSavedPick] = useState(existingPick);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts in read-only "here's what you picked" mode whenever a pick
  // already exists (a fresh page load with a saved prediction) — editing
  // reopens the dropdowns, saving successfully closes them again.
  const [editing, setEditing] = useState(!curtainCallPickMade(existingPick));
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

  function handleEliminatedChange(slot: 1 | 2, next: string | null) {
    setDraft((d) =>
      slot === 1
        ? { ...d, elim1: next, elim2: next && next === d.elim2 ? null : d.elim2 }
        : { ...d, elim2: next, elim1: next && next === d.elim1 ? null : d.elim1 }
    );
  }

  // A couple can hold one place, so picking one already placed moves it.
  function handlePodiumChange(place: number, next: string | null) {
    setDraft((d) => ({
      ...d,
      podium: d.podium.map((id, index) => (index === place ? next : id === next ? null : id)) as PodiumPick,
    }));
  }

  // submit_prediction wants both slots of a double elimination filled or both
  // blank, and submit_podium_prediction all three places or none — mirror that
  // here so Save is disabled on a half-filled state instead of erroring on
  // submit.
  const allOrNone = (ids: (string | null)[]) => ids.every(Boolean) || !ids.some(Boolean);
  const eliminationPickValid = isFinale
    ? allOrNone(draft.podium)
    : !isDoubleElimination || allOrNone([draft.elim1, draft.elim2]);

  function fillFrom(sourceLeagueId: string) {
    const source = otherLeagues.find((l) => l.id === sourceLeagueId);
    if (!source?.pick) return;
    setDraft(adaptCurtainCallPick(source.pick, new Set(activeCouples.map((c) => c.id))));
    setFilledFrom(source.name);
  }

  async function handleSubmit() {
    setError(null);
    setOtherResults([]);
    setSubmitting(true);
    try {
      const pick = { ...draft, elim2: isDoubleElimination ? draft.elim2 : null };
      const results = await submitPredictionToLeagues([leagueId, ...alsoSaveTo], episode.id, pick);
      const own = results.find((result) => result.leagueId === leagueId);
      if (!own || own.error) setError(own?.error ?? "Could not confirm your save. Please try again.");
      else {
        setSavedPick(pick);
        setEditing(false);
      }
      setOtherResults(results.filter((result) => result.leagueId !== leagueId));
    } catch {
      setError("Could not confirm your save. Your choices are still here; please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function cancelEditing() {
    setDraft(savedPick);
    setFilledFrom(null);
    setError(null);
    setEditing(false);
  }

  const hasSavedPick = curtainCallPickMade(savedPick);
  const lockLine = isLocked
    ? "Predictions are locked for this week."
    : lockAt && formattedLockAt
      ? `Locks ${formattedLockAt}`
      : null;

  // Same ratio applied server-side at scoring time (computeWeeklyScores in
  // src/lib/scoring.ts) — couplesRemaining reuses activeCouples.length, the
  // same spoiler-safe count already driving this picker's options, so a
  // spoiler-shy manager never sees a preview that reveals more than their
  // own picker does.
  const couplesRemaining = activeCouples.length;
  const eliminationExact = curtainCallPayout(eliminationPredictionPoints, couplesRemaining, totalCouples);
  const topScorerExact = curtainCallPayout(topScorerPredictionPoints, couplesRemaining, totalCouples);
  const eliminationPreview = isFinale
    ? podiumPreviewCopy(eliminationExact)
    : curtainCallPreviewCopy({
        kind: "elimination",
        exactDisplayPoints: eliminationExact,
        nearMissPoints: curtainCallNearMissPoints(eliminationExact),
        nearMissEnabled,
      });
  const topScorerPreview = curtainCallPreviewCopy({
    kind: "top_scorer",
    exactDisplayPoints: topScorerExact,
    nearMissPoints: curtainCallNearMissPoints(topScorerExact),
    nearMiss2Points: curtainCallNearMiss2Points(topScorerExact),
    nearMissEnabled,
  });
  const pickSources = otherLeagues.filter((l) => l.pick);

  return (
    <div className="flex flex-col gap-4">
        {lockLine && <p className="text-sm text-muted-foreground">{lockLine}</p>}
        {categoryWeight !== 1 && !isLocked && <p className="text-xs text-muted-foreground">Previews show module points before your league’s × {categoryWeight} weight.</p>}
        {isFinale && !isLocked ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-text">
            🏆 The Finale: nobody goes home tonight, so call the podium.
          </div>
        ) : (
          isDoubleElimination &&
          !isLocked && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-text">
              ⚡ Double Elimination — two couples go home tonight, call &apos;em both.
            </div>
          )
        )}
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
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
              <p className="text-xs text-muted-foreground">{eliminationPreview}</p>
              {isFinale ? (
                PODIUM_QUESTIONS.map((question, place) => (
                  <CoupleSelect
                    key={question}
                    id={`podium-${place + 1}`}
                    label={question}
                    value={draft.podium[place]}
                    onChange={(v) => handlePodiumChange(place, v)}
                    couples={activeCouples}
                    nameFor={nameFor}
                    lineup={lineup}
                  />
                ))
              ) : isDoubleElimination ? (
                <>
                  <CoupleSelect
                    id="eliminated-1"
                    label="Eliminated (1 of 2)"
                    value={draft.elim1}
                    onChange={(v) => handleEliminatedChange(1, v)}
                    couples={activeCouples}
                    nameFor={nameFor}
                    lineup={lineup}
                    excludeId={draft.elim2 ?? undefined}
                  />
                  <CoupleSelect
                    id="eliminated-2"
                    label="Eliminated (2 of 2)"
                    value={draft.elim2}
                    onChange={(v) => handleEliminatedChange(2, v)}
                    couples={activeCouples}
                    nameFor={nameFor}
                    lineup={lineup}
                    excludeId={draft.elim1 ?? undefined}
                  />
                </>
              ) : (
                <CoupleSelect
                  id="eliminated"
                  label="Who goes home?"
                  value={draft.elim1}
                  onChange={(v) => setDraft((d) => ({ ...d, elim1: v }))}
                  couples={activeCouples}
                  nameFor={nameFor}
                  lineup={lineup}
                />
              )}
              <p className="text-xs text-muted-foreground">{topScorerPreview}</p>
              <CoupleSelect
                id="top-scorer"
                label="Who scores highest?"
                value={draft.topScorer}
                onChange={(v) => setDraft((d) => ({ ...d, topScorer: v }))}
                couples={activeCouples}
                nameFor={nameFor}
                lineup={lineup}
              />
              <AlsoSaveTo
                destinations={otherLeagues}
                selected={alsoSaveTo}
                onChange={setAlsoSaveTo}
                disabled={submitting}
              />
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={submitting || !eliminationPickValid}>
                  {submitting ? "Saving…" : "Save Prediction"}
                </Button>
                {hasSavedPick && (
                  <Button variant="outline" onClick={cancelEditing} disabled={submitting}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-emerald-text">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/30 text-[10px]">
                    ✓
                  </span>
                  Picks saved
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit Picks
                </Button>
              </div>
              <SavedPickRows pick={savedPick} isFinale={isFinale} nameFor={nameFor} />
            </div>
          )
        ) : (
          // Everyone else's picks now live in the League at a Glance list at
          // the bottom of this same card — this is just the viewer's own.
          <SavedPickRows pick={savedPick} isFinale={isFinale} nameFor={nameFor} />
        )}
    </div>
  );
}
