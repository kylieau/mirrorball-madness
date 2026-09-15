"use client";

import { useEffect, useState } from "react";
import { scheduleEpisode, updateSeasonSettings } from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  useBrowserTimeZone,
  airsAtToUtcIso,
  utcIsoToLocalInput,
  nextTuesdayAt8pmEasternForInput,
} from "@/lib/use-browser-time-zone";
import {
  deriveResultsStatus,
  RESULTS_STATUS_BADGE_VARIANT,
  RESULTS_STATUS_BADGE_LABEL,
} from "@/lib/results-status";
import type { DraftState } from "@/lib/results-draft";
import { formatEpisodeLabel } from "@/lib/format-week";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

type Episode = {
  id: string;
  week_number: number;
  airs_at: string;
  theme: string | null;
  is_elimination_week: boolean;
  is_finale: boolean;
  is_double_elimination_week: boolean;
  results_published_at: string | null;
};
type EpisodeResult = { episode_id: string; couple_id: string };
type Couple = { id: string; celebrity_name: string; pro_name: string };
type Season = {
  id: string;
  premiere_date: string | null;
  total_episodes: number | null;
  finale_date: string | null;
} | null;

function SeasonSettingsCard({ season }: { season: Season }) {
  const [premiereDate, setPremiereDate] = useState(season?.premiere_date ?? "");
  const [totalEpisodes, setTotalEpisodes] = useState(season?.total_episodes?.toString() ?? "");
  const [finaleDate, setFinaleDate] = useState(season?.finale_date ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!season) return null;

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const result = await updateSeasonSettings({
      seasonId: season!.id,
      premiereDate: premiereDate || null,
      totalEpisodes: totalEpisodes ? Number(totalEpisodes) : null,
      finaleDate: finaleDate || null,
    });
    if (result.error) setError(result.error);
    else setSaved(true);
    setSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>Premiere Date</Label>
            <Input
              type="date"
              value={premiereDate}
              placeholder="TBD"
              onChange={(e) => {
                setPremiereDate(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Total Episodes</Label>
            <Input
              type="number"
              min={1}
              value={totalEpisodes}
              placeholder="TBD"
              onChange={(e) => {
                setTotalEpisodes(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Finale Date</Label>
            <Input
              type="date"
              value={finaleDate}
              placeholder="TBD"
              onChange={(e) => {
                setFinaleDate(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScheduleManager({
  episodes,
  episodeResults,
  draftsByEpisode,
  season,
  activeCouples,
  participantsByEpisode,
}: {
  episodes: Episode[];
  episodeResults: EpisodeResult[];
  draftsByEpisode: Record<string, DraftState>;
  season: Season;
  activeCouples: Couple[];
  participantsByEpisode: Record<string, string[]>;
}) {
  const sortedEpisodes = [...episodes].sort((a, b) => a.week_number - b.week_number);
  const browserTimeZone = useBrowserTimeZone();
  const allActiveCoupleIds = new Set(activeCouples.map((c) => c.id));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [weekNumber, setWeekNumber] = useState(
    sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1].week_number + 1 : 1
  );
  const [airsAt, setAirsAt] = useState("");
  const [theme, setTheme] = useState("");
  const [isEliminationWeek, setIsEliminationWeek] = useState(true);
  const [isFinale, setIsFinale] = useState(false);
  const [isDoubleEliminationWeek, setIsDoubleEliminationWeek] = useState(false);
  const [participantCoupleIds, setParticipantCoupleIds] = useState<Set<string>>(allActiveCoupleIds);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Next Tuesday 8pm ET for the first-ever episode; otherwise a week after
  // whatever's already the last scheduled one, so scheduling several weeks in
  // one sitting doesn't keep suggesting the same date. Computed client-side
  // only (useEffect, not the initial render) since it depends on "now" and
  // the browser's own time zone — doing it during render would mismatch the
  // server's SSR pass and trigger a hydration error.
  function defaultAirDate(): string {
    if (sortedEpisodes.length === 0) return nextTuesdayAt8pmEasternForInput();
    const last = sortedEpisodes[sortedEpisodes.length - 1];
    const weekLater = new Date(last.airs_at).getTime() + 7 * 24 * 60 * 60 * 1000;
    return utcIsoToLocalInput(new Date(weekLater).toISOString());
  }

  useEffect(() => {
    setAirsAt(defaultAirDate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddEpisode() {
    setError(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEditEpisode(e: Episode) {
    setError(null);
    setEditingId(e.id);
    setWeekNumber(e.week_number);
    setAirsAt(utcIsoToLocalInput(e.airs_at));
    setTheme(e.theme ?? "");
    setIsEliminationWeek(e.is_elimination_week);
    setIsFinale(e.is_finale);
    setIsDoubleEliminationWeek(e.is_double_elimination_week);
    const configured = participantsByEpisode[e.id];
    setParticipantCoupleIds(configured && configured.length > 0 ? new Set(configured) : allActiveCoupleIds);
    setSheetOpen(true);
  }

  function resetForm() {
    setEditingId(null);
    setWeekNumber(
      sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1].week_number + 1 : 1
    );
    setAirsAt(defaultAirDate());
    setTheme("");
    setIsEliminationWeek(true);
    setIsFinale(false);
    setIsDoubleEliminationWeek(false);
    setParticipantCoupleIds(allActiveCoupleIds);
  }

  function toggleParticipant(coupleId: string) {
    setParticipantCoupleIds((prev) => {
      const next = new Set(prev);
      if (next.has(coupleId)) next.delete(coupleId);
      else next.add(coupleId);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const airsAtUtc = airsAtToUtcIso(airsAt);
    if (!airsAtUtc) {
      setError("Enter a valid air date.");
      return;
    }

    setSubmitting(true);
    // Sending every active couple back as "participants" is functionally
    // identical to sending none (resolveEpisodeCoupleIds treats an empty
    // list as unrestricted) — but sending [] keeps ordinary weeks writing
    // zero episode_participants rows and needing zero admin attention.
    const isFullCast =
      participantCoupleIds.size === allActiveCoupleIds.size &&
      [...allActiveCoupleIds].every((id) => participantCoupleIds.has(id));
    const result = await scheduleEpisode({
      weekNumber,
      airsAt: airsAtUtc,
      theme: theme.trim() || null,
      isEliminationWeek,
      isFinale,
      isDoubleEliminationWeek,
      participantCoupleIds: isFullCast ? [] : [...participantCoupleIds],
    });
    if (result.error) {
      setError(result.error);
    } else {
      resetForm();
      setSheetOpen(false);
    }
    setSubmitting(false);
  }

  function coupleCount(episodeId: string): number {
    const publishedCount = episodeResults.filter((r) => r.episode_id === episodeId).length;
    if (publishedCount > 0) return publishedCount;
    return draftsByEpisode[episodeId]?.entries.length ?? 0;
  }

  return (
    <div className="flex flex-col gap-6">
      <SeasonSettingsCard season={season} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Scheduled Episodes</CardTitle>
          <Button size="sm" onClick={openAddEpisode}>
            <PlusIcon className="size-4" />
            Add Episode
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 p-0">
          {sortedEpisodes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing scheduled yet.</p>
          ) : (
            sortedEpisodes.map((e) => {
              const status = deriveResultsStatus(
                { results_published_at: e.results_published_at },
                !!draftsByEpisode[e.id]?.hasDraft
              );
              const count = coupleCount(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => openEditEpisode(e)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border p-4 text-left last:border-b-0 hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {formatEpisodeLabel(e.week_number)}
                        {e.theme ? ` — ${e.theme}` : ""}
                      </p>
                      <Badge variant={RESULTS_STATUS_BADGE_VARIANT[status]}>
                        {RESULTS_STATUS_BADGE_LABEL[status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.airs_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {count > 0 && ` · ${count} couple${count === 1 ? "" : "s"} scored`}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Scheduled Episode" : "Schedule a New Episode"}</SheetTitle>
            <SheetDescription>
              Air date/theme here are informational scheduling only — actual results are entered on the
              Enter Results tab.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col gap-2">
              <Label>Episode Number</Label>
              <Input
                type="number"
                min={1}
                value={weekNumber}
                onChange={(e) => setWeekNumber(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Air Date{browserTimeZone ? ` (${browserTimeZone})` : ""}</Label>
              <Input type="datetime-local" value={airsAt} onChange={(e) => setAirsAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Theme Night</Label>
              <Input
                placeholder="e.g. Villains Night"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isEliminationWeek}
                  onChange={(e) => {
                    setIsEliminationWeek(e.target.checked);
                    if (!e.target.checked) setIsDoubleEliminationWeek(false);
                  }}
                />
                Elimination Week
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isFinale} onChange={(e) => setIsFinale(e.target.checked)} />
                Finale
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDoubleEliminationWeek}
                  disabled={!isEliminationWeek}
                  onChange={(e) => setIsDoubleEliminationWeek(e.target.checked)}
                />
                Double Elimination
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Who&apos;s Performing?</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setParticipantCoupleIds(
                      participantCoupleIds.size === allActiveCoupleIds.size
                        ? new Set()
                        : new Set(allActiveCoupleIds)
                    )
                  }
                >
                  {participantCoupleIds.size === allActiveCoupleIds.size ? "Clear all" : "Select all"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave everyone checked for an ordinary week. Uncheck couples who aren&apos;t performing this
                episode (e.g. a split-broadcast premiere) — Enter Results and Curtain Call will only show
                who&apos;s checked here.
              </p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {activeCouples.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={participantCoupleIds.has(c.id)}
                      onChange={() => toggleParticipant(c.id)}
                    />
                    {c.celebrity_name} &amp; {c.pro_name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={submitting || !airsAt}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Add to schedule"}
              </Button>
              <Button variant="ghost" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
