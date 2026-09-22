"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveEpisodeDraft,
  addEpisodeCustomMoment,
  removeEpisodeCustomMoment,
  publishEpisodeResults,
} from "@/app/admin/results/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BOTTOM_NAV_STACK_ABOVE } from "@/components/bottom-nav";
import { buildPeopleDisplayNames, type CoupleNameParts } from "@/lib/couple-display";
import { CoupleName, coupleNameNode } from "@/components/couple-name";
import {
  deriveResultsStatus,
  RESULTS_STATUS_BADGE_VARIANT,
  RESULTS_STATUS_BADGE_LABEL,
  type EpisodeResultsStatus,
} from "@/lib/results-status";
import { useRelativeTimeAgo } from "@/lib/use-browser-time-zone";
import type { DraftState } from "@/lib/results-draft";
import { formatEpisodeCasual, formatEpisodeCasualWithTheme, formatEnterResultsOption } from "@/lib/format-week";
import { resultsEntryCoupleIds, selectableCast } from "@/lib/episode-cast";
import { judgesForScoreInputs, type ScoringJudge } from "@/lib/scoring-judges";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type CoupleWithStatus = Couple & {
  status: string;
  elimination_week: number | null;
};
type Named = { id: string; name: string };
type ScheduledEpisode = {
  id: string;
  episode_number: number;
  week_id: string | null;
  airs_at: string;
  theme: string | null;
  results_published_at: string | null;
};
type CompetitionWeek = {
  id: string;
  week_number: number;
  theme: string | null;
  is_elimination_week: boolean;
  is_finale: boolean;
  is_double_elimination_week: boolean;
};
type Outcome = "safe" | "eliminated" | "withdrawn" | "bye" | "winner" | "runner_up" | "third_place";
type StatusValue = Outcome;

const STATUS_LABELS: Record<StatusValue, string> = {
  safe: "Safe",
  eliminated: "Eliminated",
  withdrawn: "Withdrawn",
  bye: "Did Not Dance",
  winner: "Winner",
  runner_up: "Runner-up",
  third_place: "Third Place",
};

function statusOptions(isFinale: boolean): StatusValue[] {
  const base: StatusValue[] = ["safe", "eliminated", "withdrawn", "bye"];
  return isFinale ? [...base, "winner", "runner_up", "third_place"] : base;
}

type RowDance = {
  key: string;
  danceStyleId: string;
  songTitle: string;
  scores: Record<string, string>; // judgeId -> input string
};

type CoupleRow = {
  outcome: Outcome;
  savedByJudges: boolean;
  wasTeamDance: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string;
  dances: RowDance[];
};

function emptyRow(): CoupleRow {
  return {
    outcome: "safe",
    savedByJudges: false,
    wasTeamDance: false,
    hadImmunity: false,
    bonusPoints: 0,
    bonusNote: "",
    dances: [],
  };
}

function danceTotal(dance: RowDance): number {
  return Object.values(dance.scores).reduce((sum, v) => {
    const n = Number(v);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

function isPerfectScore(dance: RowDance, judgeCount: number): boolean {
  const entered = Object.values(dance.scores).filter((v) => v !== "");
  if (entered.length === 0 || entered.length < judgeCount) return false;
  return entered.every((v) => Number(v) === 10);
}

function buildRowsFromDraft(draft: DraftState | undefined, couples: Couple[]): Record<string, CoupleRow> {
  const rows: Record<string, CoupleRow> = {};
  for (const c of couples) rows[c.id] = emptyRow();

  for (const entry of draft?.entries ?? []) {
    rows[entry.coupleId] = {
      outcome: entry.outcome,
      savedByJudges: entry.savedByJudges,
      wasTeamDance: entry.wasTeamDance,
      hadImmunity: entry.hadImmunity,
      bonusPoints: entry.bonusPoints,
      bonusNote: entry.bonusNote ?? "",
      dances: rows[entry.coupleId]?.dances ?? [],
    };
  }

  for (const d of draft?.dances ?? []) {
    const row = rows[d.coupleId] ?? emptyRow();
    row.dances = [
      ...row.dances,
      {
        key: d.id,
        danceStyleId: d.danceStyleId,
        songTitle: d.songTitle ?? "",
        scores: Object.fromEntries(d.judgeScores.map((js) => [js.judgeId, String(js.score)])),
      },
    ];
    rows[d.coupleId] = row;
  }

  return rows;
}

export function ResultsForm({
  canPublish,
  activeCouples,
  allCouplesWithStatus,
  coupleDisplayNames,
  allCoupleDisplayNames,
  judges,
  danceStyles,
  episodes,
  weeks,
  draftsByEpisode,
  forceSelectEpisodeId,
  participantsByEpisode,
}: {
  // Commissioners draft results; only is_super_admin publishes them.
  // Server-side requireAdminAccess is the real gate — this just avoids
  // showing a button that would 403.
  canPublish: boolean;
  activeCouples: Couple[];
  allCouplesWithStatus: CoupleWithStatus[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  allCoupleDisplayNames: Record<string, CoupleNameParts>;
  judges: ScoringJudge[];
  danceStyles: Named[];
  episodes: ScheduledEpisode[];
  weeks: CompetitionWeek[];
  draftsByEpisode: Record<string, DraftState>;
  // Set by AllResultsView's "Correct Results" button (lifted up into
  // AdminResultsTabs) to jump here already pointed at that episode, once
  // startEpisodeCorrection has seeded a fresh draft for it.
  forceSelectEpisodeId?: string | null;
  participantsByEpisode: Record<string, string[]>;
}) {
  const weekById = new Map(weeks.map((week) => [week.id, week]));
  const nightsCountByWeek = new Map<string, number>();
  for (const episode of episodes) {
    if (!episode.week_id) continue;
    nightsCountByWeek.set(episode.week_id, (nightsCountByWeek.get(episode.week_id) ?? 0) + 1);
  }
  const sortedEpisodes = [...episodes].sort((a, b) => {
    const weekA = a.week_id ? (weekById.get(a.week_id)?.week_number ?? 9999) : 9999;
    const weekB = b.week_id ? (weekById.get(b.week_id)?.week_number ?? 9999) : 9999;
    if (weekA !== weekB) return weekA - weekB;
    return a.episode_number - b.episode_number;
  });
  const router = useRouter();

  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");

  useEffect(() => {
    if (forceSelectEpisodeId) setSelectedEpisodeId(forceSelectEpisodeId);
  }, [forceSelectEpisodeId]);

  const selectedEpisode = sortedEpisodes.find((e) => e.id === selectedEpisodeId) ?? null;
  const selectedWeek = selectedEpisode?.week_id ? (weekById.get(selectedEpisode.week_id) ?? null) : null;
  const isFinale = selectedWeek?.is_finale ?? false;
  const nightsCount = selectedEpisode?.week_id ? (nightsCountByWeek.get(selectedEpisode.week_id) ?? 1) : 1;

  // Upcoming / unpublished: still-competing cast only, so an already-voted-off
  // couple can't be scored again. Published weeks keep whoever was still in
  // as of that week (and anyone already on the correction draft) so history
  // stays editable.
  const published = selectedEpisode?.results_published_at != null;
  const selectable = selectedEpisode
    ? selectableCast(allCouplesWithStatus, selectedWeek?.week_number ?? selectedEpisode.episode_number, {
        published,
      })
    : [];
  const episodeCoupleIds = resultsEntryCoupleIds({
    selectableIds: selectable.map((c) => c.id),
    participantIds: participantsByEpisode[selectedEpisode?.id ?? ""] ?? [],
    draftCoupleIds: selectedEpisode
      ? (draftsByEpisode[selectedEpisode.id]?.entries ?? []).map((e) => e.coupleId)
      : [],
    published,
  });
  const couplesById = new Map(allCouplesWithStatus.map((c) => [c.id, c]));
  const episodeCouples = episodeCoupleIds
    .map((id) => couplesById.get(id) ?? activeCouples.find((c) => c.id === id))
    .filter((c): c is Couple => !!c);

  const [expectedDanceCount, setExpectedDanceCount] = useState(1);
  const [judgesSaveAvailable, setJudgesSaveAvailable] = useState(false);
  const [rows, setRows] = useState<Record<string, CoupleRow>>({});
  const [customMoments, setCustomMoments] = useState<DraftState["customMoments"]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [customMomentLabel, setCustomMomentLabel] = useState("");
  const [customMomentCoupleId, setCustomMomentCoupleId] = useState("");
  const [addingCustomMoment, setAddingCustomMoment] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraftRef = useRef<() => Promise<{ error: string | null }>>(async () => ({ error: null }));
  const draftSavedAgo = useRelativeTimeAgo(draftSavedAt);

  // saveEpisodeDraft's revalidatePath("/admin/results") makes Next
  // auto-refresh this route's server props for the client that called it —
  // including draftsByEpisode — which would otherwise re-trigger the
  // rehydrate effect below and stomp whatever the admin has typed since.
  // Sidesteps that by having flushDraft mark which episode it just saved,
  // and the effect skips exactly that one self-triggered refresh.
  const justSavedEpisodeId = useRef<string | null>(null);
  const previousEpisodeId = useRef<string | null>(null);

  function coupleParts(c: Couple): CoupleNameParts {
    return (
      allCoupleDisplayNames[c.id] ??
      coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name }
    );
  }

  function namedCouple(coupleId: string): Couple | undefined {
    return (
      episodeCouples.find((c) => c.id === coupleId) ??
      activeCouples.find((c) => c.id === coupleId) ??
      allCouplesWithStatus.find((c) => c.id === coupleId)
    );
  }

  // Rehydrate from the persisted draft whenever the selected episode
  // changes — this is what fixes the old form's append-only-local-state
  // gap: the form's initial state *is* the persisted draft, not empty.
  useEffect(() => {
    if (!selectedEpisode) return;
    // Only a genuine switch to a *different* episode should dismiss the
    // "just published" banner — Publish's own revalidation re-runs this
    // same effect for the episode that was just published (to pick up its
    // fresh results_published_at), which must leave the banner alone.
    if (previousEpisodeId.current !== selectedEpisode.id) {
      previousEpisodeId.current = selectedEpisode.id;
      setJustPublished(false);
    }
    const wasSelfTriggered = justSavedEpisodeId.current === selectedEpisode.id;
    justSavedEpisodeId.current = null;
    if (wasSelfTriggered) return;
    const draft = draftsByEpisode[selectedEpisode.id];
    setJudgesSaveAvailable(draft?.judgesSaveAvailable ?? false);
    setRows(buildRowsFromDraft(draft, episodeCouples));
    setCustomMoments(draft?.customMoments ?? []);
    setDraftSavedAt(draft?.updatedAt ?? null);
    setHasDraft(draft?.hasDraft ?? false);
    setError(null);
    // expectedDanceCount isn't part of the draft tables — it only caps how
    // many "+ Dance" rows are offered per couple while drafting. Publish
    // derives the real value from however many dances actually got
    // entered, so there's nothing to carry over here; default to 1.
    setExpectedDanceCount(1);
    // Depends on the draft's own updatedAt/hasDraft, not just the episode
    // id, so a fresh draft seeded by "Correct Results" (same episode,
    // brand-new draft rows) still triggers a rehydrate even though the id
    // didn't change.
  }, [selectedEpisode?.id, draftsByEpisode[selectedEpisode?.id ?? ""]?.updatedAt, draftsByEpisode[selectedEpisode?.id ?? ""]?.hasDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const status: EpisodeResultsStatus | null = selectedEpisode
    ? deriveResultsStatus({ results_published_at: selectedEpisode.results_published_at }, hasDraft)
    : null;

  function buildDraftInput() {
    return {
      episodeId: selectedEpisode!.id,
      // Caption column is no longer editable here (it never drove scores or
      // display). Pass through any stored value so a draft save doesn't wipe it.
      guestJudgeName: draftsByEpisode[selectedEpisode!.id]?.guestJudgeName ?? null,
      judgesSaveAvailable,
      entries: episodeCouples.map((c) => {
        const row = rows[c.id] ?? emptyRow();
        return {
          coupleId: c.id,
          dances: row.dances
            .filter((d) => d.danceStyleId)
            .map((d) => ({
              danceStyleId: d.danceStyleId,
              songTitle: d.songTitle.trim() || null,
              judgeScores: Object.entries(d.scores)
                .filter(([, v]) => v !== "")
                .map(([judgeId, v]) => ({ judgeId, score: Number(v) })),
            })),
          outcome: row.outcome,
          savedByJudges: row.savedByJudges,
          wasTeamDance: row.wasTeamDance,
          hadImmunity: row.hadImmunity,
          bonusPoints: row.bonusPoints,
          bonusNote: row.bonusNote.trim() || null,
        };
      }),
    };
  }

  async function flushDraft(): Promise<{ error: string | null }> {
    if (!selectedEpisode) return { error: null };
    setSavingDraft(true);
    justSavedEpisodeId.current = selectedEpisode.id;
    const result = await saveEpisodeDraft(buildDraftInput());
    if (result.error) {
      setError(result.error);
    } else {
      setError(null);
      setDraftSavedAt(new Date().toISOString());
      setHasDraft(true);
    }
    setSavingDraft(false);
    return result;
  }

  async function handlePublish() {
    if (!selectedEpisode) return;
    setError(null);
    setPublishing(true);
    // Flush any pending edits first so Publish never publishes stale data.
    const saveResult = await flushDraft();
    if (saveResult.error) {
      setPublishing(false);
      return;
    }
    const publishResult = await publishEpisodeResults(selectedEpisode.id);
    if (publishResult.error) {
      setError(publishResult.error);
    } else {
      setHasDraft(false);
      setJustPublished(true);
      router.refresh();
    }
    setPublishing(false);
  }

  // scheduleAutosave() runs synchronously right after the setRows() call
  // that triggered it, in the same render — so flushDraft here would still
  // close over the *pre-update* rows (setRows hasn't re-rendered yet). By
  // the time the timer fires, that stale flushDraft would silently save
  // the couple's *previous* status, wiping out whatever was just picked.
  // flushDraftRef is reassigned on every render (below), so the callback
  // always calls whichever flushDraft closure is current when it actually
  // fires, not the one from the render that scheduled it.
  flushDraftRef.current = flushDraft;

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void flushDraftRef.current();
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  function updateRow(coupleId: string, patch: Partial<CoupleRow>) {
    setRows((prev) => ({ ...prev, [coupleId]: { ...(prev[coupleId] ?? emptyRow()), ...patch } }));
    scheduleAutosave();
  }

  function setStatus(coupleId: string, value: StatusValue) {
    updateRow(coupleId, { outcome: value });
  }

  function danceCountFor(coupleId: string): number {
    return (rows[coupleId]?.dances ?? []).length;
  }

  function addDance(coupleId: string) {
    const row = rows[coupleId] ?? emptyRow();
    updateRow(coupleId, {
      dances: [...row.dances, { key: `new-${Date.now()}-${Math.random()}`, danceStyleId: "", songTitle: "", scores: {} }],
    });
  }

  function updateDance(coupleId: string, danceKey: string, patch: Partial<RowDance>) {
    const row = rows[coupleId] ?? emptyRow();
    updateRow(coupleId, {
      dances: row.dances.map((d) => (d.key === danceKey ? { ...d, ...patch } : d)),
    });
  }

  function removeDance(coupleId: string, danceKey: string) {
    const row = rows[coupleId] ?? emptyRow();
    updateRow(coupleId, { dances: row.dances.filter((d) => d.key !== danceKey) });
  }

  function addTeamDance(coupleIds: string[], danceStyleId: string, songTitle: string, scores: Record<string, string>) {
    setRows((prev) => {
      const next = { ...prev };
      for (const coupleId of coupleIds) {
        const row = next[coupleId] ?? emptyRow();
        next[coupleId] = {
          ...row,
          wasTeamDance: true,
          dances: [
            ...row.dances,
            { key: `team-${Date.now()}-${Math.random()}-${coupleId}`, danceStyleId, songTitle, scores: { ...scores } },
          ],
        };
      }
      return next;
    });
    scheduleAutosave();
  }

  async function handleAddCustomMoment() {
    if (!selectedEpisode || !customMomentLabel.trim()) return;
    setAddingCustomMoment(true);
    const result = await addEpisodeCustomMoment({
      episodeId: selectedEpisode.id,
      coupleId: customMomentCoupleId || null,
      label: customMomentLabel.trim(),
    });
    if (result.error) {
      setError(result.error);
    } else {
      setCustomMoments((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, coupleId: customMomentCoupleId || null, label: customMomentLabel.trim() },
      ]);
      setCustomMomentLabel("");
      setCustomMomentCoupleId("");
    }
    setAddingCustomMoment(false);
  }

  async function handleRemoveCustomMoment(momentId: string) {
    setCustomMoments((prev) => prev.filter((m) => m.id !== momentId));
    await removeEpisodeCustomMoment(momentId);
  }

  const judgeDisplayNames = buildPeopleDisplayNames(judges);
  function judgesForDance(dance: RowDance) {
    const scoredIds = Object.entries(dance.scores)
      .filter(([, v]) => v !== "")
      .map(([id]) => id);
    return judgesForScoreInputs(judges, scoredIds);
  }
  const episodeItems = Object.fromEntries(
    sortedEpisodes.map((e) => {
      const week = e.week_id ? weekById.get(e.week_id) : undefined;
      return [
        e.id,
        formatEnterResultsOption({
          weekNumber: week?.week_number ?? null,
          nightsCount: e.week_id ? (nightsCountByWeek.get(e.week_id) ?? 1) : 1,
          episodeTheme: e.theme,
          airsAt: e.airs_at,
        }),
      ];
    })
  );
  const danceStyleItems = Object.fromEntries(danceStyles.map((d) => [d.id, d.name]));

  // Perfect Score / Judges' Save pills, computed from current row state —
  // no new storage, matches the plan's "computed at render time" call.
  const perfectScorePills: { coupleId: string; danceStyleId: string }[] = [];
  const judgesSavePills: string[] = [];
  for (const c of episodeCouples) {
    const row = rows[c.id];
    if (!row) continue;
    if (row.savedByJudges) judgesSavePills.push(c.id);
    for (const d of row.dances) {
      if (d.danceStyleId && isPerfectScore(d, judgesForDance(d).length)) {
        perfectScorePills.push({ coupleId: c.id, danceStyleId: d.danceStyleId });
      }
    }
  }

  const eliminationOrder = allCouplesWithStatus
    .filter((c) => c.elimination_week !== null || c.status === "winner" || c.status === "runner_up" || c.status === "third_place")
    .sort((a, b) => (a.elimination_week ?? 999) - (b.elimination_week ?? 999));

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <p className="font-medium">Wait for the West Coast broadcast</p>
        <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
          Don&apos;t enter results until the episode has finished airing live on the West Coast
          (tape-delayed) — entering results right after the East Coast airing spoils it for
          Pacific-time players.
        </p>
      </div>

      {justPublished && selectedEpisode && (
        <div className="rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-3 text-sm text-emerald-text">
          <p className="font-medium">
            ✅{" "}
            {selectedWeek
              ? nightsCount >= 2 && selectedEpisode.theme?.trim()
                ? `${formatEpisodeCasual(selectedWeek.week_number)} · ${selectedEpisode.theme.trim()}`
                : formatEpisodeCasualWithTheme(selectedWeek.week_number, selectedWeek.theme ?? selectedEpisode.theme)
              : selectedEpisode.theme?.trim() || "Exhibition"}{" "}
            results published
          </p>
          <p className="mt-0.5 text-emerald-text/90">Now live on Results &amp; Standings across every league.</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Enter Results</CardTitle>
            {status && <Badge variant={RESULTS_STATUS_BADGE_VARIANT[status]}>{RESULTS_STATUS_BADGE_LABEL[status]}</Badge>}
          </div>
          {selectedEpisode && (
            <CardDescription>
              {savingDraft
                ? "Saving draft..."
                : draftSavedAt
                  ? `Draft saved ${draftSavedAgo}`
                  : "Not saved yet"}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label>Week</Label>
          {sortedEpisodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No episodes scheduled yet — add one under the Schedule tab first.
            </p>
          ) : (
            <Select
              items={episodeItems}
              value={selectedEpisodeId}
              onValueChange={(v) => setSelectedEpisodeId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a Week" />
              </SelectTrigger>
              <SelectContent>
                {sortedEpisodes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {episodeItems[e.id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedEpisode && (
        <>
          {selectedWeek?.is_double_elimination_week && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">⚡ Double Elimination Week</p>
              <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                Mark two couples Eliminated below — Curtain Call is collecting two guesses from
                managers this week.
              </p>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Episode Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Air Date</Label>
                <p className="text-sm">{new Date(selectedEpisode.airs_at).toLocaleString()}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Theme</Label>
                <p className="text-sm">{selectedEpisode.theme ?? "—"}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="danceCount">Dances (Per Couple)</Label>
                <Input
                  id="danceCount"
                  type="number"
                  min={1}
                  value={expectedDanceCount}
                  onChange={(e) => setExpectedDanceCount(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <div>
                  <Label htmlFor="judgesSave">Judges&apos; Save active this episode</Label>
                  <p className="text-xs text-muted-foreground">
                    Enables the per-couple &quot;Judges&apos; Save used&quot; option below.
                  </p>
                </div>
                <Switch
                  id="judgesSave"
                  checked={judgesSaveAvailable}
                  onCheckedChange={(checked) => {
                    setJudgesSaveAvailable(checked);
                    scheduleAutosave();
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Enter raw judges&apos; scores — each league&apos;s Judges&apos; Score Multiplier
                applies automatically once results are published. To add a score box
                (including a one-off guest), use Settings. Archive them there when
                they&apos;re done so they don&apos;t keep appearing as empty boxes. Leave a
                box blank on weeks they didn&apos;t judge.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Couples &amp; Scores</CardTitle>
                <Sheet open={teamSheetOpen} onOpenChange={setTeamSheetOpen}>
                  <SheetTrigger render={<Button variant="outline" size="sm" />}>Score a Team Dance</SheetTrigger>
                  <TeamDanceSheetContent
                    couples={episodeCouples}
                    coupleParts={coupleParts}
                    danceStyles={danceStyles}
                    judges={judgesForScoreInputs(judges)}
                    judgeDisplayNames={judgeDisplayNames}
                    danceCountFor={danceCountFor}
                    expectedDanceCount={expectedDanceCount}
                    onSubmit={(coupleIds, danceStyleId, songTitle, scores) => {
                      addTeamDance(coupleIds, danceStyleId, songTitle, scores);
                      setTeamSheetOpen(false);
                    }}
                  />
                </Sheet>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {episodeCouples.map((c) => {
                const row = rows[c.id] ?? emptyRow();
                const canAddDance = row.dances.length < expectedDanceCount;
                return (
                  <div key={c.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        <CoupleName {...coupleParts(c)} />
                      </p>
                      <Select
                        items={STATUS_LABELS}
                        value={row.outcome}
                        onValueChange={(v) => setStatus(c.id, (v as StatusValue) ?? "safe")}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions(isFinale).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {STATUS_LABELS[opt]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {row.outcome === "bye" && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        For a couple still in the cast tonight who didn&apos;t perform (an
                        odd-couple bye, a mid-competition injury) — stays active, earns no survival
                        bonus this week. For a couple not appearing this broadcast at all, use
                        &quot;Who&apos;s Performing?&quot; under Edit Scheduled Episode instead.
                      </p>
                    )}

                    <div className="mt-3 flex flex-col gap-2">
                      {row.dances.map((d) => (
                        <div key={d.key} className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Select
                              items={danceStyleItems}
                              value={d.danceStyleId}
                              onValueChange={(v) => updateDance(c.id, d.key, { danceStyleId: v ?? "" })}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Dance style" />
                              </SelectTrigger>
                              <SelectContent>
                                {danceStyles.map((ds) => (
                                  <SelectItem key={ds.id} value={ds.id}>
                                    {ds.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Song title"
                              value={d.songTitle}
                              onChange={(e) => updateDance(c.id, d.key, { songTitle: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-wrap items-end gap-2">
                            {judgesForDance(d).map((j) => (
                              <div key={j.id} className="flex flex-col gap-1">
                                <Label className="text-xs text-muted-foreground">
                                  {judgeDisplayNames.get(j.id) ?? j.name}
                                </Label>
                                <Input
                                  className="w-16"
                                  placeholder="—"
                                  value={d.scores[j.id] ?? ""}
                                  onChange={(e) =>
                                    updateDance(c.id, d.key, { scores: { ...d.scores, [j.id]: e.target.value } })
                                  }
                                />
                              </div>
                            ))}
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-muted-foreground">Total</Label>
                              <p className="flex h-8 items-center text-sm font-medium">{danceTotal(d)}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => removeDance(c.id, d.key)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                      {canAddDance && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="self-start"
                          disabled={row.outcome === "bye"}
                          onClick={() => addDance(c.id)}
                        >
                          + Dance
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.savedByJudges}
                          disabled={!judgesSaveAvailable}
                          onChange={(e) => updateRow(c.id, { savedByJudges: e.target.checked })}
                        />
                        Judges&apos; Save used
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.hadImmunity}
                          onChange={(e) => updateRow(c.id, { hadImmunity: e.target.checked })}
                        />
                        Immunity
                      </label>
                      <BonusDisclosure row={row} onChange={(patch) => updateRow(c.id, patch)} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Special Moments</CardTitle>
              <CardDescription>Perfect scores and Judges&apos; Save are detected automatically.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {perfectScorePills.map((p, i) => {
                  const couple = namedCouple(p.coupleId);
                  return (
                    <Badge key={i} variant="secondary">
                      ⭐ Perfect Score — {couple ? <CoupleName {...coupleParts(couple)} /> : null}
                    </Badge>
                  );
                })}
                {judgesSavePills.map((coupleId) => {
                  const couple = namedCouple(coupleId);
                  return (
                    <Badge key={coupleId} variant="secondary">
                      🛡️ Judges&apos; Save — {couple ? <CoupleName {...coupleParts(couple)} /> : null}
                    </Badge>
                  );
                })}
                {customMoments.map((m) => (
                  <Badge key={m.id} variant="outline" className="gap-1.5">
                    {m.label}
                    {m.coupleId && (
                      <>
                        {" — "}
                        {(() => {
                          const c = namedCouple(m.coupleId);
                          return c ? <CoupleName {...coupleParts(c)} /> : null;
                        })()}
                      </>
                    )}
                    <button
                      type="button"
                      aria-label="Remove"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handleRemoveCustomMoment(m.id)}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                {perfectScorePills.length === 0 && judgesSavePills.length === 0 && customMoments.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing yet this week.</p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Custom Event</Label>
                  <Input
                    className="w-48"
                    placeholder="e.g. Dance-off win"
                    value={customMomentLabel}
                    onChange={(e) => setCustomMomentLabel(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Couple (Optional)</Label>
                  <Select
                    items={{ "": "—", ...Object.fromEntries(episodeCouples.map((c) => [c.id, coupleNameNode(coupleParts(c))])) }}
                    value={customMomentCoupleId}
                    onValueChange={(v) => setCustomMomentCoupleId(v ?? "")}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {episodeCouples.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {coupleNameNode(coupleParts(c))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={handleAddCustomMoment}
                  disabled={!customMomentLabel.trim() || addingCustomMoment}
                >
                  + Add Custom Event
                </Button>
              </div>
            </CardContent>
          </Card>

          {eliminationOrder.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Season Elimination Order</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {eliminationOrder.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between border-t border-border py-1.5 text-sm first:border-t-0">
                    <span>
                      {i + 1}. <CoupleName {...(allCoupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name })} />
                    </span>
                    <span className="text-muted-foreground">
                      {c.status === "winner" || c.status === "runner_up" || c.status === "third_place"
                        ? STATUS_LABELS[c.status as StatusValue]
                        : formatEpisodeCasual(c.elimination_week!)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className={`fixed inset-x-0 z-30 ${BOTTOM_NAV_STACK_ABOVE}`}>
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="hidden text-xs text-muted-foreground sm:block">
                {canPublish
                  ? "Publishing updates Results & Standings across every league immediately."
                  : "Your draft is saved for a site admin to review and publish."}
              </p>
              <div className="flex gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => void flushDraft()}
                  disabled={savingDraft || publishing}
                >
                  {savingDraft ? "Saving..." : "Save Draft"}
                </Button>
                {canPublish && (
                  <Button className="flex-1 sm:flex-none" onClick={handlePublish} disabled={savingDraft || publishing}>
                    {publishing ? "Publishing..." : "Publish Results"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BonusDisclosure({
  row,
  onChange,
}: {
  row: CoupleRow;
  onChange: (patch: Partial<CoupleRow>) => void;
}) {
  const [open, setOpen] = useState(row.bonusPoints !== 0 || row.bonusNote !== "");

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        + Bonus Points
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        className="w-16"
        value={row.bonusPoints}
        onChange={(e) => onChange({ bonusPoints: Number(e.target.value) })}
      />
      <Input
        className="w-40"
        placeholder="e.g. Dance-off win"
        value={row.bonusNote}
        onChange={(e) => onChange({ bonusNote: e.target.value })}
      />
    </div>
  );
}

function TeamDanceSheetContent({
  couples,
  coupleParts,
  danceStyles,
  judges,
  judgeDisplayNames,
  danceCountFor,
  expectedDanceCount,
  onSubmit,
}: {
  couples: Couple[];
  coupleParts: (c: Couple) => CoupleNameParts;
  danceStyles: Named[];
  judges: Named[];
  judgeDisplayNames: Map<string, string>;
  danceCountFor: (coupleId: string) => number;
  expectedDanceCount: number;
  onSubmit: (coupleIds: string[], danceStyleId: string, songTitle: string, scores: Record<string, string>) => void;
}) {
  const [selectedCoupleIds, setSelectedCoupleIds] = useState<Set<string>>(new Set());
  const [danceStyleId, setDanceStyleId] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});

  const availableCouples = couples.filter((c) => danceCountFor(c.id) < expectedDanceCount);
  const total = Object.values(scores).reduce((sum, v) => {
    const n = Number(v);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  function toggle(coupleId: string) {
    setSelectedCoupleIds((prev) => {
      const next = new Set(prev);
      if (next.has(coupleId)) next.delete(coupleId);
      else next.add(coupleId);
      return next;
    });
  }

  function reset() {
    setSelectedCoupleIds(new Set());
    setDanceStyleId("");
    setSongTitle("");
    setScores({});
  }

  return (
    <SheetContent className="overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Score a Team Dance</SheetTitle>
        <SheetDescription>One shared score applied to every couple selected below.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Couples on This Team</Label>
          <div className="flex flex-wrap gap-3">
            {availableCouples.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={selectedCoupleIds.has(c.id)} onChange={() => toggle(c.id)} />
                <CoupleName {...coupleParts(c)} />
              </label>
            ))}
          </div>
        </div>
        <Select items={Object.fromEntries(danceStyles.map((d) => [d.id, d.name]))} value={danceStyleId} onValueChange={(v) => setDanceStyleId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Dance style" />
          </SelectTrigger>
          <SelectContent>
            {danceStyles.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Song title" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
        <div className="flex flex-wrap items-end gap-2">
          {judges.map((j) => (
            <div key={j.id} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{judgeDisplayNames.get(j.id) ?? j.name}</Label>
              <Input
                className="w-16"
                placeholder="—"
                value={scores[j.id] ?? ""}
                onChange={(e) => setScores((prev) => ({ ...prev, [j.id]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Total</Label>
            <p className="flex h-8 items-center text-sm font-medium">{total}</p>
          </div>
        </div>
        <Button
          disabled={selectedCoupleIds.size === 0 || !danceStyleId}
          onClick={() => {
            onSubmit([...selectedCoupleIds], danceStyleId, songTitle, scores);
            reset();
          }}
        >
          Add Team Dance
        </Button>
      </div>
    </SheetContent>
  );
}
