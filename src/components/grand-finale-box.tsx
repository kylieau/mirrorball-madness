"use client";

import { useState } from "react";
import {
  submitGrandFinalePredictionToLeagues,
  type LeagueSaveResult,
} from "@/app/leagues/[id]/predictions/actions";
import { AlsoSaveTo, OtherLeagueSaveSummary, UsePicksFrom } from "@/components/other-leagues-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { coupleNameNode } from "@/components/couple-name";
import type { CoupleNameParts } from "@/lib/couple-display";
import { useFormattedDeadline } from "@/lib/use-browser-time-zone";
import { usePersistedState } from "@/lib/use-persisted-state";
import {
  nextPredictedElimination,
  pinEliminatedFirst,
  pinnedEliminatedIds,
} from "@/lib/grand-finale-pins";
import {
  GrandFinaleOrderList,
  GrandFinaleScoringExplainer,
  NextEliminationFrame,
  PointsTag,
  grandFinaleRowContext,
  type GrandFinaleCouple,
  type GrandFinaleScoring,
} from "@/components/grand-finale-order-list";
import { GrandFinaleLeagueList } from "@/components/grand-finale-league-list";
import type { LeagueGrandFinalePrediction } from "@/lib/grand-finale-predictions";
import { adaptGrandFinaleOrder, defaultSelection, type GrandFinaleDestination } from "@/lib/copy-picks";

export function GrandFinaleBox({
  leagueId,
  couples,
  coupleDisplayNames,
  existingOrder,
  deadline,
  isLocked,
  otherLeagues,
  scoring,
  leagueGrandFinale,
}: {
  leagueId: string;
  couples: GrandFinaleCouple[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  existingOrder: string[] | null;
  deadline: string | null;
  isLocked: boolean;
  otherLeagues: GrandFinaleDestination[];
  scoring: GrandFinaleScoring;
  leagueGrandFinale: LeagueGrandFinalePrediction[];
}) {
  const alphabeticalCouples = [...couples].sort((a, b) => a.celebrity_name.localeCompare(b.celebrity_name));
  const totalCouples = couples.length;

  // Editing an existing prediction skips straight to the reorder step,
  // pre-filled — only a brand-new prediction starts with tap-to-build.
  const [phase, setPhase] = useState<"select" | "edit">(existingOrder ? "edit" : "select");
  // Already-revealed eliminations are fixed at the bottom of the ranking; only
  // the still-competing couples are the viewer's to place.
  const pinnedIds = pinnedEliminatedIds(couples);
  const pinnedCount = pinnedIds.length;
  const [order, setOrder] = useState<string[]>(existingOrder ?? pinnedIds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read-only "here's your order" view whenever a saved prediction already
  // exists — reordering reopens the arrows, saving successfully closes them.
  const [reviewing, setReviewing] = useState(!!existingOrder);
  const [alsoSaveTo, setAlsoSaveTo] = useState(() => defaultSelection(otherLeagues));
  const [otherResults, setOtherResults] = useState<LeagueSaveResult[]>([]);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const formattedDeadline = useFormattedDeadline(deadline);
  // Only meaningful once locked — collapses the full bracket down to just the
  // next-predicted-elimination row so the card doesn't dominate the page once
  // there's a permanent League at a Glance list underneath it.
  const [collapsed, setCollapsed] = usePersistedState<boolean>(`gf-own-collapsed:${leagueId}`, false);

  const coupleById = new Map(couples.map((c) => [c.id, c]));
  const rowContext = grandFinaleRowContext(couples);

  function nameFor(coupleId: string) {
    const c = coupleById.get(coupleId);
    return coupleNameNode(
      coupleDisplayNames[coupleId] ?? { celebrity: c?.celebrity_name ?? "Unknown", pro: c?.pro_name ?? "Unknown" }
    );
  }

  // Only offer a league whose ranking fits this season's cast, so a pre-fill
  // never lands in the reorder step in a state the RPC would reject.
  const seasonCoupleIds = couples.map((c) => c.id);
  const pickSources = otherLeagues.filter(
    (l) => l.order && adaptGrandFinaleOrder(l.order, seasonCoupleIds, pinnedIds)
  );

  function fillFrom(sourceLeagueId: string) {
    const source = otherLeagues.find((l) => l.id === sourceLeagueId);
    const adapted = source?.order && adaptGrandFinaleOrder(source.order, seasonCoupleIds, pinnedIds);
    if (!source || !adapted) return;
    setOrder(adapted);
    setFilledFrom(source.name);
    setPhase("edit");
  }

  function tapCouple(coupleId: string) {
    const next = [...order, coupleId];
    setOrder(next);
    if (next.length === couples.length) setPhase("edit");
  }

  function undoLastTap() {
    if (order.length > pinnedCount) setOrder(order.slice(0, -1));
  }

  function startOver() {
    setOrder(pinnedIds);
    setPhase("select");
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (index < pinnedCount || target < pinnedCount || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  async function handleSubmit() {
    setError(null);
    setOtherResults([]);
    setSubmitting(true);
    const results = await submitGrandFinalePredictionToLeagues([leagueId, ...alsoSaveTo], order);
    const own = results.find((r) => r.leagueId === leagueId);
    if (own?.error) setError(own.error);
    else setReviewing(true);
    setOtherResults(results.filter((r) => r.leagueId !== leagueId));
    setSubmitting(false);
  }

  // Shared read-only treatment for both "locked" and "saved, still
  // editable" — surfaces the predicted winner prominently instead of just
  // the full order, matching every "Your Season Bracket" mockup
  // regardless of which other modules are on. Keeps GrandFinaleBox a single
  // card shape everywhere it renders rather than a Grand-Finale-only
  // variant and a combined-with-other-modules variant.
  function renderSummary(locked: boolean) {
    const winnerId = order[order.length - 1];
    const highlightId = nextPredictedElimination(order, couples);
    const isCollapsed = locked && collapsed;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Your Season Bracket</CardTitle>
            <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-accent">
              {locked ? "Locked" : "Saved"}
            </span>
          </div>
          <CardDescription>
            {nameFor(winnerId)} to take the mirrorball.
            {locked ? " Predictions are locked." : " Can still be edited before the deadline."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <OtherLeagueSaveSummary results={otherResults} destinations={otherLeagues} />
          <GrandFinaleScoringExplainer scoring={scoring} totalCouples={totalCouples} />

          {isCollapsed ? (
            <div className="flex flex-col gap-2">
              {highlightId ? (
                <NextEliminationFrame>{nameFor(highlightId)}</NextEliminationFrame>
              ) : (
                <p className="text-muted-foreground">Nothing left to predict — your bracket&apos;s fully resolved.</p>
              )}
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setCollapsed(false)}>
                Tap to view full bracket
              </Button>
            </div>
          ) : (
            <>
              <GrandFinaleOrderList
                order={order}
                couples={couples}
                coupleDisplayNames={coupleDisplayNames}
                scoring={scoring}
                totalCouples={totalCouples}
                showStatus
                showNextEliminationHighlight
              />
              {locked && (
                <Button variant="ghost" size="sm" className="mt-1 self-start" onClick={() => setCollapsed(true)}>
                  Collapse bracket
                </Button>
              )}
            </>
          )}

          {!locked && (
            <Button variant="outline" size="sm" className="mt-2 self-start" onClick={() => {
                setOrder(pinEliminatedFirst(order, pinnedIds));
                setReviewing(false);
              }}>
              Edit Order
            </Button>
          )}

          {locked && <GrandFinaleLeagueList
            leagueId={leagueId}
            managers={leagueGrandFinale}
            couples={couples}
            coupleDisplayNames={coupleDisplayNames}
            scoring={scoring}
          />}
        </CardContent>
      </Card>
    );
  }

  if (isLocked) {
    if (!existingOrder) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Your Season Bracket</CardTitle>
            <CardDescription>Predictions are locked.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              You didn&apos;t submit a Full-Order Prediction before the deadline.
            </p>
            <GrandFinaleLeagueList
              leagueId={leagueId}
              managers={leagueGrandFinale}
              couples={couples}
              coupleDisplayNames={coupleDisplayNames}
              scoring={scoring}
            />
          </CardContent>
        </Card>
      );
    }
    return renderSummary(true);
  }

  if (phase === "select") {
    const remaining = alphabeticalCouples.filter((c) => !order.includes(c.id));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Season Bracket</CardTitle>
          <CardDescription>
            Tap couples in the order you think they&apos;ll be eliminated — first tap is who goes home first, last is your predicted winner. Saving needs every couple placed.
            {deadline ? ` Locks at ${formattedDeadline}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <GrandFinaleScoringExplainer scoring={scoring} totalCouples={totalCouples} />

          {order.length === pinnedCount && <UsePicksFrom sources={pickSources} onPick={fillFrom} />}

          <p className="text-sm font-medium text-accent">
            {order.length} of {couples.length} placed
            {pinnedCount > 0 && ` · ${pinnedCount} already eliminated`}
          </p>

          {order.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your Order So Far
              </p>
              {order.map((coupleId, i) => (
                <div key={coupleId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {i + 1}. {nameFor(coupleId)}
                  </span>
                  <PointsTag
                    couple={coupleById.get(coupleId)}
                    predictedPosition={i + 1}
                    scoring={scoring}
                    totalCouples={totalCouples}
                    context={rowContext}
                  />
                </div>
              ))}
              {order.length > pinnedCount && (
                <Button variant="ghost" size="sm" className="self-start" onClick={undoLastTap}>
                  Undo Last Tap
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {order.length === pinnedCount ? "Tap who's eliminated first" : "Tap who's eliminated next"}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {remaining.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  size="sm"
                  className="h-auto justify-start whitespace-normal py-1.5 text-left"
                  onClick={() => tapCouple(c.id)}
                >
                  {nameFor(c.id)}
                </Button>
              ))}
            </div>
          </div>

          <Button disabled>Save prediction ({order.length}/{couples.length})</Button>
        </CardContent>
      </Card>
    );
  }

  if (reviewing) {
    return renderSummary(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Season Bracket</CardTitle>
        <CardDescription>
          Review your predicted order, season winner to first eliminated. Use the arrows to fine-tune.
          {deadline ? ` Locks at ${formattedDeadline}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GrandFinaleScoringExplainer scoring={scoring} totalCouples={totalCouples} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {filledFrom && (
          <p className="text-xs text-muted-foreground">Filled in from {filledFrom} — review, then save.</p>
        )}

        <div className="flex flex-col gap-1">
          {/* Displayed winner-first, same reasoning as renderSummary above.
              order[] itself stays elimination-ascending (index 0 = first
              eliminated), so each arrow's actualIndex maps back into it:
              ↑ (toward 1st place) moves toward the end of order[], ↓ moves
              toward the start. */}
          {[...order].reverse().map((coupleId, displayIndex) => {
            const actualIndex = order.length - 1 - displayIndex;
            return (
              <div
                key={coupleId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <span>
                  {displayIndex + 1}. {nameFor(coupleId)}
                </span>
                <span className="flex items-center gap-2">
                  <PointsTag
                    couple={coupleById.get(coupleId)}
                    predictedPosition={actualIndex + 1}
                    scoring={scoring}
                    totalCouples={totalCouples}
                    context={rowContext}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={displayIndex === 0 || actualIndex < pinnedCount}
                    onClick={() => moveEntry(actualIndex, 1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={actualIndex <= pinnedCount}
                    onClick={() => moveEntry(actualIndex, -1)}
                  >
                    ↓
                  </Button>
                </span>
              </div>
            );
          })}
        </div>

        <AlsoSaveTo
          destinations={otherLeagues}
          selected={alsoSaveTo}
          onChange={setAlsoSaveTo}
          disabled={submitting}
        />

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save prediction"}
          </Button>
          <Button variant="outline" onClick={startOver} disabled={submitting}>
            Start Over
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
