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
import { formatEpisodeLabel } from "@/lib/format-week";
import { resolveEpisodeCoupleIds } from "@/lib/episode-participants";

type Couple = { id: string; celebrity_name: string; pro_name: string };
type CoupleWithStatus = Couple & {
  status: string;
  elimination_week: number | null;
};
type Named = { id: string; name: string };
type ScheduledEpisode = {
  id: string;
  week_number: number;
  airs_at: string;
  theme: string | null;
  is_elimination_week: boolean;
  is_finale: boolean;
  is_double_elimination_week: boolean;
  results_published_at: string | null;
};
type Outcome = "safe" | "eliminated" | "withdrawn" | "bye" | "winner" | "runner_up" | "third_place";
type StatusValue = Outcome | "bottom_two" | "bottom_three";

const STATUS_LABELS: Record<StatusValue, string> = {
  safe: "Safe",
  bottom_two: "Bottom 2",
  bottom_three: "Bottom 3",
  eliminated: "Eliminated",
  withdrawn: "Withdrawn",
  bye: "Bye",
  winner: "Winner",
  runner_up: "Runner-up",
  third_place: "Third place",
};

function statusOptions(isFinale: boolean): StatusValue[] {
  const base: StatusValue[] = ["safe", "bottom_two", "bottom_three", "eliminated", "withdrawn", "bye"];
  return isFinale ? [...base, "winner", "runner_up", "third_place"] : base;
}

function statusValueFromRow(outcome: Outcome, wasBottomTwo: boolean, wasBottomThree: boolean): StatusValue {
  if (outcome !== "safe") return outcome;
  if (wasBottomTwo) return "bottom_two";
  if (wasBottomThree) return "bottom_three";
  return "safe";
}

type RowDance = {
  key: string;
  danceStyleId: string;
  songTitle: string;
  scores: Record<string, string>; // judgeId -> input string
};

type CoupleRow = {
  outcome: Outcome;
  wasBottomTwo: boolean;
  wasBottomThree: boolean;
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
    wasBottomTwo: false,
    wasBottomThree: false,
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
      wasBottomTwo: entry.wasBottomTwo,
      wasBottomThree: entry.wasBottomThree,
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
  activeCouples,
  allCouplesWithStatus,
  coupleDisplayNames,
  allCoupleDisplayNames,
  judges,
  danceStyles,
  episodes,
  draftsByEpisode,
  forceSelectEpisodeId,
  participantsByEpisode,
}: {
  activeCouples: Couple[];
  allCouplesWithStatus: CoupleWithStatus[];
  coupleDisplayNames: Record<string, CoupleNameParts>;
  allCoupleDisplayNames: Record<string, CoupleNameParts>;
  judges: Named[];
  danceStyles: Named[];
  episodes: ScheduledEpisode[];
  draftsByEpisode: Record<string, DraftState>;
  // Set by AllResultsView's "Correct Results" button (lifted up into
  // AdminResultsTabs) to jump here already pointed at that episode, once
  // startEpisodeCorrection has seeded a fresh draft for it.
  forceSelectEpisodeId?: string | null;
  participantsByEpisode: Record<string, string[]>;
}) {
  const sortedEpisodes = [...episodes].sort((a, b) => a.week_number - b.week_number);
  const router = useRouter();

  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");

  useEffect(() => {
    if (forceSelectEpisodeId) setSelectedEpisodeId(forceSelectEpisodeId);
  }, [forceSelectEpisodeId]);

  const selectedEpisode = sortedEpisodes.find((e) => e.id === selectedEpisodeId) ?? null;
  const isFinale = selectedEpisode?.is_finale ?? false;

  // Narrows the couple list to whoever actually performed this episode (a
  // split-broadcast premiere) — empty participants config means everyone,
  // the ordinary case.
  const episodeCouples = resolveEpisodeCoupleIds(
    activeCouples.map((c) => c.id),
    participantsByEpisode[selectedEpisode?.id ?? ""] ?? []
  )
    .map((id) => activeCouples.find((c) => c.id === id))
    .filter((c): c is Couple => !!c);

  const [expectedDanceCount, setExpectedDanceCount] = useState(1);
  const [guestJudgeName, setGuestJudgeName] = useState("");
  const [judgesSaveAvailable, setJudgesSaveAvailable] = useState(false);
  const [rows, setRows] = useState<Record<string, CoupleRow>>({});
  const [customMoments, setCustomMoments] = useState<DraftState["customMoments"]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [customMomentLabel, setCustomMomentLabel] = useState("");
  const [customMomentCoupleId, setCustomMomentCoupleId] = useState("");
  const [addingCustomMoment, setAddingCustomMoment] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSavedAgo = useRelativeTimeAgo(draftSavedAt);

  function coupleParts(c: Couple): CoupleNameParts {
    return coupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name };
  }

  // Rehydrate from the persisted draft whenever the selected episode
  // changes — this is what fixes the old form's append-only-local-state
  // gap: the form's initial state *is* the persisted draft, not empty.
  useEffect(() => {
    if (!selectedEpisode) return;
    const draft = draftsByEpisode[selectedEpisode.id];
    setGuestJudgeName(draft?.guestJudgeName ?? "");
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
      guestJudgeName: guestJudgeName.trim() || null,
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
          wasBottomTwo: row.wasBottomTwo,
          wasBottomThree: row.wasBottomThree,
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
      router.refresh();
    }
    setPublishing(false);
  }

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void flushDraft();
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
    const outcome: Outcome = value === "bottom_two" || value === "bottom_three" ? "safe" : value;
    updateRow(coupleId, {
      outcome,
      wasBottomTwo: value === "bottom_two",
      wasBottomThree: value === "bottom_three",
    });
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
  const episodeItems = Object.fromEntries(
    sortedEpisodes.map((e) => [
      e.id,
      `${formatEpisodeLabel(e.week_number)}${e.theme ? ` — ${e.theme}` : ""} — ${new Date(e.airs_at).toLocaleDateString()}`,
    ])
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
      if (d.danceStyleId && isPerfectScore(d, judges.length)) {
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
          <Label>Scheduled Episode</Label>
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
          {selectedEpisode.is_double_elimination_week && (
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
                <Label htmlFor="guestJudge">Guest Judge</Label>
                <Input
                  id="guestJudge"
                  placeholder="None this week"
                  value={guestJudgeName}
                  onChange={(e) => {
                    setGuestJudgeName(e.target.value);
                    scheduleAutosave();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="danceCount">Dances (per couple)</Label>
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
                applies automatically once results are published.
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
                    judges={judges}
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
                const statusValue = statusValueFromRow(row.outcome, row.wasBottomTwo, row.wasBottomThree);
                const canAddDance = row.dances.length < expectedDanceCount;
                return (
                  <div key={c.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        <CoupleName {...coupleParts(c)} />
                      </p>
                      <Select
                        items={STATUS_LABELS}
                        value={statusValue}
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
                            {judges.map((j) => (
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
                        <Button size="sm" variant="outline" className="self-start" onClick={() => addDance(c.id)}>
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
                {perfectScorePills.map((p, i) => (
                  <Badge key={i} variant="secondary">
                    ⭐ Perfect Score — <CoupleName {...coupleParts(activeCouples.find((c) => c.id === p.coupleId)!)} />
                  </Badge>
                ))}
                {judgesSavePills.map((coupleId) => (
                  <Badge key={coupleId} variant="secondary">
                    🛡️ Judges&apos; Save — <CoupleName {...coupleParts(activeCouples.find((c) => c.id === coupleId)!)} />
                  </Badge>
                ))}
                {customMoments.map((m) => (
                  <Badge key={m.id} variant="outline" className="gap-1.5">
                    {m.label}
                    {m.coupleId && (
                      <>
                        {" — "}
                        {(() => {
                          const c = activeCouples.find((cc) => cc.id === m.coupleId);
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
                  <Label className="text-xs text-muted-foreground">Custom event</Label>
                  <Input
                    className="w-48"
                    placeholder="e.g. Dance-off win"
                    value={customMomentLabel}
                    onChange={(e) => setCustomMomentLabel(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Couple (optional)</Label>
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
                  + Add custom event
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
                        : formatEpisodeLabel(c.elimination_week!)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:static sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Publishing updates This Week &amp; Standings across every league immediately.
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
              <Button className="flex-1 sm:flex-none" onClick={handlePublish} disabled={savingDraft || publishing}>
                {publishing ? "Publishing..." : "Publish Results"}
              </Button>
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
        + Bonus points
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
          <Label className="text-xs text-muted-foreground">Couples on this team</Label>
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
          Add team dance
        </Button>
      </div>
    </SheetContent>
  );
}
