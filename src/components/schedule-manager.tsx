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
import { formatEpisodeCasualWithTheme, formatEpisodeLabel } from "@/lib/format-week";
import {
  defaultCheckedParticipantIds,
  isFullSelectableCast,
  participantIdsToPersist,
  selectableCast,
} from "@/lib/episode-cast";
import { exhibitionEpisodes, groupEpisodesByWeek } from "@/lib/competition-week";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

type Episode = {
  id: string;
  episode_number: number;
  week_id: string | null;
  airs_at: string;
  theme: string | null;
  results_published_at: string | null;
  status: string;
};
type CompetitionWeek = {
  id: string;
  week_number: number;
  theme: string | null;
  is_elimination_week: boolean;
  is_finale: boolean;
  is_double_elimination_week: boolean;
};
type EpisodeResult = { episode_id: string; couple_id: string };
type Couple = {
  id: string;
  celebrity_name: string;
  pro_name: string;
  status: string;
  elimination_week: number | null;
};
type Season = {
  id: string;
  premiere_date: string | null;
  total_episodes: number | null;
  finale_date: string | null;
  season_number: number | null;
} | null;

function SeasonSettingsCard({ season, readOnly }: { season: Season; readOnly: boolean }) {
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
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
              onChange={(e) => {
                setFinaleDate(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
            {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ScheduleManager({
  readOnly,
  episodes,
  weeks,
  episodeResults,
  draftsByEpisode,
  season,
  seasonCouples,
  participantsByEpisode,
}: {
  // The schedule is readable by anyone signed in, but scheduling episodes is
  // season-wide structural config — admin only.
  readOnly: boolean;
  episodes: Episode[];
  weeks: CompetitionWeek[];
  episodeResults: EpisodeResult[];
  draftsByEpisode: Record<string, DraftState>;
  season: Season;
  seasonCouples: Couple[];
  participantsByEpisode: Record<string, string[]>;
}) {
  const sortedEpisodes = [...episodes].sort(
    (a, b) => a.episode_number - b.episode_number || a.airs_at.localeCompare(b.airs_at)
  );
  const groupedWeeks = groupEpisodesByWeek(weeks, episodes);
  const exhibition = exhibitionEpisodes(episodes);
  const weekById = new Map(weeks.map((week) => [week.id, week]));
  const browserTimeZone = useBrowserTimeZone();

  const nextEpisodeNumber =
    sortedEpisodes.length > 0 ? Math.max(...sortedEpisodes.map((e) => e.episode_number)) + 1 : 1;
  const nextWeekNumber = weeks.length > 0 ? Math.max(...weeks.map((week) => week.week_number)) + 1 : 1;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPublished, setEditingPublished] = useState(false);
  const [episodeNumber, setEpisodeNumber] = useState(nextEpisodeNumber);
  const [competitionWeek, setCompetitionWeek] = useState(String(nextWeekNumber));
  const [weekTheme, setWeekTheme] = useState("");
  const [airsAt, setAirsAt] = useState("");
  const [theme, setTheme] = useState("");
  const [isEliminationWeek, setIsEliminationWeek] = useState(true);
  const [isFinale, setIsFinale] = useState(false);
  const [isDoubleEliminationWeek, setIsDoubleEliminationWeek] = useState(false);
  const [participantCoupleIds, setParticipantCoupleIds] = useState<Set<string>>(new Set());

  const parsedWeekNumber = competitionWeek.trim() === "" ? null : Number(competitionWeek);
  const assignedWeek =
    parsedWeekNumber != null && Number.isInteger(parsedWeekNumber)
      ? (weeks.find((week) => week.week_number === parsedWeekNumber) ?? null)
      : null;
  const castWeek = parsedWeekNumber ?? episodeNumber;
  const selectableCouples = selectableCast(seasonCouples, castWeek, { published: editingPublished });
  const selectableIds = selectableCouples.map((c) => c.id);
  const allSelectableChecked = isFullSelectableCast(
    selectableIds.filter((id) => participantCoupleIds.has(id)),
    selectableIds
  );

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

  function applyExistingWeekFlags(weekNumber: number | null) {
    if (weekNumber == null) return;
    const existing = weeks.find((week) => week.week_number === weekNumber);
    if (!existing) return;
    setWeekTheme(existing.theme ?? "");
    setIsEliminationWeek(existing.is_elimination_week);
    setIsFinale(existing.is_finale);
    setIsDoubleEliminationWeek(existing.is_double_elimination_week);
  }

  function openAddEpisode() {
    setError(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEditEpisode(e: Episode) {
    setError(null);
    setEditingId(e.id);
    const published = e.results_published_at != null;
    setEditingPublished(published);
    setEpisodeNumber(e.episode_number);
    const week = e.week_id ? weekById.get(e.week_id) : undefined;
    setCompetitionWeek(week ? String(week.week_number) : "");
    setWeekTheme(week?.theme ?? "");
    setAirsAt(utcIsoToLocalInput(e.airs_at));
    setTheme(e.theme ?? "");
    setIsEliminationWeek(week?.is_elimination_week ?? true);
    setIsFinale(week?.is_finale ?? false);
    setIsDoubleEliminationWeek(week?.is_double_elimination_week ?? false);
    const selectable = selectableCast(seasonCouples, week?.week_number ?? e.episode_number, {
      published,
    }).map((c) => c.id);
    setParticipantCoupleIds(new Set(defaultCheckedParticipantIds(participantsByEpisode[e.id], selectable)));
    setSheetOpen(true);
  }

  function resetForm() {
    setEditingId(null);
    setEditingPublished(false);
    setEpisodeNumber(nextEpisodeNumber);
    setCompetitionWeek(String(nextWeekNumber));
    setWeekTheme("");
    setAirsAt(defaultAirDate());
    setTheme("");
    setIsEliminationWeek(true);
    setIsFinale(false);
    setIsDoubleEliminationWeek(false);
    setParticipantCoupleIds(
      new Set(selectableCast(seasonCouples, nextWeekNumber, { published: false }).map((c) => c.id))
    );
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
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
      setError("Episode number must be a positive integer.");
      return;
    }
    if (
      competitionWeek.trim() !== "" &&
      (!Number.isInteger(parsedWeekNumber) || (parsedWeekNumber ?? 0) < 1)
    ) {
      setError("Competition week must be a positive integer, or blank for exhibition.");
      return;
    }

    setSubmitting(true);
    // Sending every selectable couple back as "participants" is
    // functionally identical to sending none (resolveEpisodeCoupleIds
    // treats an empty list as unrestricted) — but sending [] keeps
    // ordinary weeks writing zero episode_participants rows.
    const result = await scheduleEpisode({
      episodeId: editingId,
      episodeNumber,
      competitionWeekNumber: parsedWeekNumber,
      weekTheme: weekTheme.trim() || null,
      airsAt: airsAtUtc,
      theme: theme.trim() || null,
      isEliminationWeek: parsedWeekNumber != null ? isEliminationWeek : false,
      isFinale: parsedWeekNumber != null ? isFinale : false,
      isDoubleEliminationWeek: parsedWeekNumber != null ? isDoubleEliminationWeek : false,
      participantCoupleIds: participantIdsToPersist(participantCoupleIds, selectableIds),
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

  function EpisodeRow({ episodeId }: { episodeId: string }) {
    const e = episodes.find((episode) => episode.id === episodeId);
    if (!e) return null;
    const status = deriveResultsStatus(
      { results_published_at: e.results_published_at },
      !!draftsByEpisode[e.id]?.hasDraft
    );
    const count = coupleCount(e.id);
    const Row = readOnly ? "div" : "button";
    return (
      <Row
        onClick={readOnly ? undefined : () => openEditEpisode(e)}
        className={`flex w-full items-center justify-between gap-3 border-b border-border p-4 text-left last:border-b-0${
          readOnly ? "" : " hover:bg-accent/50"
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">
              {formatEpisodeLabel(e.episode_number, season?.season_number ?? null)}
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
        {!readOnly && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />}
      </Row>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SeasonSettingsCard season={season} readOnly={readOnly} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Schedule</CardTitle>
          {!readOnly && (
            <Button size="sm" onClick={openAddEpisode}>
              <PlusIcon className="size-4" />
              Add Episode
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-0 p-0">
          {sortedEpisodes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing scheduled yet.</p>
          ) : (
            <>
              {groupedWeeks.map((week) => (
                <div key={week.id}>
                  <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
                    {formatEpisodeCasualWithTheme(week.week_number, week.theme)}
                    {week.nightsLabel ? ` · ${week.nightsLabel}` : ""}
                  </div>
                  {week.episodes.map((e) => (
                    <EpisodeRow key={e.id} episodeId={e.id} />
                  ))}
                </div>
              ))}
              {exhibition.length > 0 && (
                <div>
                  <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground">
                    Exhibition
                  </div>
                  {exhibition.map((e) => (
                    <EpisodeRow key={e.id} episodeId={e.id} />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Scheduled Episode" : "Schedule a New Episode"}</SheetTitle>
            <SheetDescription>
              Each row is one TV airing. Assign it to a competition week to put it on Results and
              Picks, or leave the week blank for exhibition / interview nights.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col gap-2">
              <Label>Episode Number</Label>
              <Input
                type="number"
                min={1}
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                TV sequence for admin labels ({formatEpisodeLabel(episodeNumber, season?.season_number ?? null)}
                ). Independent of the competition week.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Competition Week</Label>
              <Input
                type="number"
                min={1}
                value={competitionWeek}
                placeholder="Blank = exhibition"
                onChange={(e) => {
                  setCompetitionWeek(e.target.value);
                  const next = e.target.value.trim() === "" ? null : Number(e.target.value);
                  if (next != null && Number.isInteger(next)) applyExistingWeekFlags(next);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to omit this airing from Results and Picks. Use the same week number
                for Night One and Night Two of a premiere.
                {assignedWeek ? " This week already exists — flags below match it." : ""}
              </p>
            </div>
            {parsedWeekNumber != null && (
              <div className="flex flex-col gap-2">
                <Label>Week Label (Optional)</Label>
                <Input
                  placeholder="e.g. Premiere"
                  value={weekTheme}
                  onChange={(e) => setWeekTheme(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>Air Date{browserTimeZone ? ` (${browserTimeZone})` : ""}</Label>
              <Input type="datetime-local" value={airsAt} onChange={(e) => setAirsAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Theme Night</Label>
              <Input
                placeholder="e.g. Night One, Villains Night"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
            </div>
            {parsedWeekNumber != null && (
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
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Who&apos;s Performing?</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setParticipantCoupleIds(allSelectableChecked ? new Set() : new Set(selectableIds))
                  }
                >
                  {allSelectableChecked ? "Clear all" : "Select all"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave everyone checked for an ordinary week. Couples already eliminated in an earlier
                week are omitted so they can&apos;t be re-included. Uncheck anyone sitting out this
                broadcast (e.g. a split premiere) — Enter Results and Curtain Call follow this list.
              </p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {selectableCouples.length === 0 ? (
                  <p className="py-1 text-sm text-muted-foreground">No couples still in the cast.</p>
                ) : (
                  selectableCouples.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={participantCoupleIds.has(c.id)}
                        onChange={() => toggleParticipant(c.id)}
                      />
                      {c.celebrity_name} &amp; {c.pro_name}
                    </label>
                  ))
                )}
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
