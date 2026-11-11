"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disableLifeline, enableLifeline, previewLifeline } from "@/app/leagues/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatPoints, formatSignedPoints } from "@/lib/format-points";
import type { LifelinePreview } from "@/lib/lifeline-enable";
import { ordinal } from "@/lib/ordinal";
import { cn } from "cn";

export type LifelineSettingsInput = {
  enabled: boolean;
  startsWeek: number | null;
  equalizerAdded: boolean;
  canEdit: boolean;
};

function weeksLabel(weeks: number[]): string {
  const first = weeks[0];
  const last = weeks.at(-1);
  return first === last ? `Week ${first}` : `Weeks ${first} to ${last}`;
}

export function LifelineSettings({
  leagueId,
  enabled,
  startsWeek,
  equalizerAdded,
  canEdit,
}: LifelineSettingsInput & { leagueId: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<LifelinePreview | null>(null);
  const [includeEqualizer, setIncludeEqualizer] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  async function review() {
    setError(null);
    setSheetError(null);
    setLoading(true);
    const result = await previewLifeline(leagueId);
    setLoading(false);
    if ("error" in result) {
      setPreview(null);
      setError(result.error);
      return;
    }
    setIncludeEqualizer(true);
    setPreview(result.preview);
  }

  async function confirm() {
    if (!preview) return;
    setSheetError(null);
    setSaving(true);
    const result = await enableLifeline(leagueId, preview.token, hasEqualizer && includeEqualizer);
    setSaving(false);
    if (result.error) {
      setSheetError(result.error);
      return;
    }
    setPreview(null);
    router.refresh();
  }

  async function turnOff() {
    setError(null);
    setSaving(true);
    const result = await disableLifeline(leagueId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const equalizerRows = preview?.rows.filter((row) => row.equalizer > 0) ?? [];
  const hasEqualizer = equalizerRows.length > 0;
  const withEqualizer = hasEqualizer && includeEqualizer;
  const standings = preview
    ? withEqualizer
      ? preview.rows
      : [...preview.rows].sort((a, b) => a.rankBefore - b.rankBefore)
    : [];
  const moves = withEqualizer ? standings.filter((row) => row.rankBefore !== row.rankAfter) : [];

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-none font-medium">Lifeline</p>
        <span className="text-sm font-medium">
          {enabled ? (startsWeek != null ? `On · From Week ${startsWeek}` : "On") : "Off"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        A manager whose couple has gone home picks a couple still dancing each week, and earns half that couple&apos;s
        Dance Card points that week, even if it goes home.
        {enabled && equalizerAdded ? " The Equalizer was added when it was turned on." : ""}
      </p>
      {canEdit && !enabled && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => void review()} disabled={loading}>
          {loading ? "Working out the numbers…" : "Turn On Lifeline…"}
        </Button>
      )}
      {canEdit && enabled && !equalizerAdded && (
        <Button variant="ghost" size="sm" className="self-start px-0 text-danger-text" onClick={() => void turnOff()} disabled={saving}>
          {saving ? "Turning off…" : "Turn Off Lifeline"}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}

      <Sheet open={preview !== null} onOpenChange={(open) => !open && !saving && setPreview(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] gap-3 overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl font-semibold">Turn On Lifeline</SheetTitle>
            <SheetDescription>
              {preview ? `Lifeline picks start in Week ${preview.startsWeek}.` : ""} Once it has picks or the Equalizer,
              it can&apos;t be turned off.
            </SheetDescription>
          </SheetHeader>

          {preview && (
            <>
              <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Include the Equalizer</p>
                  {hasEqualizer && (
                    <Switch
                      checked={includeEqualizer}
                      onCheckedChange={setIncludeEqualizer}
                      aria-label="Include the Equalizer"
                      disabled={saving}
                    />
                  )}
                </div>
                {hasEqualizer ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      One-time points for every week a roster spot sat idle before Week {preview.startsWeek} because
                      its couple had gone home: the average Lifeline that week. It shows in Score History as Lifeline
                      Backfill.
                    </p>
                    <ul className={cn("flex flex-col", !includeEqualizer && "opacity-50")}>
                      {equalizerRows.map((row) => (
                        <li
                          key={row.managerId}
                          className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0"
                        >
                          <span className="min-w-0">
                            <span className="block [overflow-wrap:anywhere] font-medium">{row.displayName}</span>
                            <span className="block text-xs text-muted-foreground">
                              {row.slotWeeks} idle spot-{row.slotWeeks === 1 ? "week" : "weeks"} · {weeksLabel(row.weeks)}
                            </span>
                          </span>
                          <span className="shrink-0 font-heading font-semibold text-accent">
                            {formatSignedPoints(row.equalizer)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No roster spot sat idle before Week {preview.startsWeek}, so there is nothing to add.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-3">
                <p className="text-sm font-medium">{withEqualizer ? "Standings With the Equalizer" : "Standings"}</p>
                <ol className="flex flex-col">
                  {standings.map((row) => {
                    const rank = withEqualizer ? row.rankAfter : row.rankBefore;
                    const moved = withEqualizer ? row.rankBefore - row.rankAfter : 0;
                    return (
                      <li
                        key={row.managerId}
                        className="flex items-center gap-2.5 border-b border-border py-2 text-sm last:border-b-0"
                      >
                        <span aria-hidden className="w-3 shrink-0 text-[10px]">
                          {moved > 0 && <span className="text-rank-up">▲</span>}
                          {moved < 0 && <span className="text-rank-down">▼</span>}
                        </span>
                        <span className="w-5 shrink-0 text-center font-rank text-sm font-bold text-muted-foreground">
                          {rank}
                        </span>
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere] font-medium">{row.displayName}</span>
                        <span className="shrink-0 text-right">
                          <span className="block font-heading font-semibold">
                            {formatPoints(withEqualizer ? row.after : row.before)}
                          </span>
                          {withEqualizer && row.equalizer > 0 && (
                            <span className="block text-xs text-muted-foreground">was {formatPoints(row.before)}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="pt-1 text-xs text-muted-foreground">
                  {moves.length > 0
                    ? moves
                        .map((row) => `${row.displayName} moves from ${ordinal(row.rankBefore)} to ${ordinal(row.rankAfter)}.`)
                        .join(" ")
                    : "No one changes place."}
                </p>
              </div>
            </>
          )}

          {sheetError && (
            <p role="alert" className="text-sm text-danger-text">
              {sheetError}
            </p>
          )}
          {sheetError ? (
            <Button className="h-11 w-full text-base font-semibold" onClick={() => void review()} disabled={loading}>
              {loading ? "Working out the numbers…" : "Review Again"}
            </Button>
          ) : (
            <Button className="h-11 w-full text-base font-semibold" onClick={() => void confirm()} disabled={saving}>
              {saving ? "Turning on…" : withEqualizer ? "Turn On With the Equalizer" : "Turn On Lifeline"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full hover:bg-transparent dark:hover:bg-transparent"
            onClick={() => setPreview(null)}
            disabled={saving}
          >
            Cancel
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
