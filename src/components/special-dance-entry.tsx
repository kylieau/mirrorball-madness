"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PencilIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScoringJudge } from "@/lib/scoring-judges";
import { undoSecondsLeft } from "@/lib/reveal-state";
import { NEW_SPECIAL_ID } from "@/lib/results-draft-input";
import {
  DEFAULT_DANCE_TYPE,
  DEFAULT_MARK_MAX,
  DETAIL_LABEL_SUGGESTIONS,
  DANCE_TYPE_SUGGESTIONS,
  RESULT_SUGGESTIONS,
  SKIP_LABEL,
  SPECIAL_DANCE_MAX_DETAILS,
  SPECIAL_DANCE_MAX_SONGS,
  SPECIAL_DANCE_MIN_JUDGES,
  SPECIAL_DANCE_MAX_JUDGES,
  THEME_LABELS,
  automaticSpecialDanceName,
  isValidMark,
  isValidPanelSize,
  markRangeMessage,
  oxfordJoin,
  parseSpecialPoints,
  parseTeamMarks,
  specialDanceComplete,
  specialDancePanel,
  specialDanceProgress,
  specialDanceSummary,
  teamMarksTotal,
  validateSpecialDanceSetup,
  type SkipReason,
  type SpecialDance,
  type SpecialDanceDetail,
  type SpecialDanceScore,
  type SpecialDanceSetupInput,
  type TeamMark,
} from "@/lib/team-dances";

export type SpecialDanceView = {
  dance: SpecialDance;
  styleName: string;
  secondStyleName: string | null;
  marks: TeamMark[];
  scores: SpecialDanceScore[];
  eligible: string[];
  skipped: { coupleId: string; reason: SkipReason }[];
  live: { total: number; coupleIds: string[]; totalByCouple: Record<string, number> } | null;
};

export type SpecialDanceParticipant = {
  id: string;
  celebrity: string;
  pro: string;
  status: string;
  eliminationWeek: number | null;
};

const MARK_MAX_OPTIONS = Array.from({ length: 19 }, (_, i) => (i + 2) / 2);

function marksToInputs(marks: TeamMark[]): Record<string, string> {
  return Object.fromEntries(marks.map((m) => [m.judgeId, String(m.score)]));
}

function marksKey(marks: TeamMark[]): string {
  return marks.map((m) => `${m.judgeId}:${m.score}`).sort().join(",");
}

function scoresKey(scores: SpecialDanceScore[]): string {
  return scores.map((s) => `${s.coupleId}:${s.points ?? ""}:${s.result ?? ""}`).sort().join(",");
}

function setupFromDance(dance: SpecialDance): SpecialDanceSetupInput {
  return {
    id: dance.id === NEW_SPECIAL_ID ? null : dance.id,
    danceType: dance.danceType,
    name: dance.nameIsAuto ? "" : dance.name,
    memberCoupleIds: dance.memberCoupleIds,
    danceStyleId: dance.danceStyleId,
    secondDanceStyleId: dance.secondDanceStyleId,
    songs: dance.songs.length > 0 ? dance.songs : [{ title: dance.songTitle ?? "", artist: null }],
    scoringMode: dance.scoringMode,
    markMax: dance.markMax,
    panelJudgeIds: dance.panelJudgeIds,
    songSource: dance.songSource,
    themeLabel: dance.themeLabel,
    details: dance.details,
    sortOrder: dance.sortOrder,
  };
}

export function blankSpecialDance(episodeId: string, styleId: string): SpecialDance {
  return {
    id: NEW_SPECIAL_ID,
    episodeId,
    name: "",
    nameIsAuto: true,
    danceType: "",
    scoringMode: "marks",
    markMax: DEFAULT_MARK_MAX,
    panelJudgeIds: null,
    danceStyleId: styleId,
    secondDanceStyleId: null,
    songs: [{ title: "", artist: null }],
    songTitle: null,
    songSource: null,
    themeLabel: null,
    details: [],
    captainCoupleId: null,
    hostName: null,
    sortOrder: 0,
    memberCoupleIds: [],
    inferred: false,
    postedAt: null,
    updatedAt: null,
  };
}

function participantReason(p: SpecialDanceParticipant): string | null {
  if (p.status === "withdrawn") return "Withdrawn";
  if (p.status === "eliminated") return p.eliminationWeek != null ? `Eliminated week ${p.eliminationWeek}` : "Eliminated";
  return null;
}

// One special dance as an entry in the couple picker: read state for scoring
// and posting, edit state (admin) for the setup fields. Marks and points
// autosave; setup saves on Done. A client-side blank entry (id "new") stays
// in edit until Dance Type and at least one participant are set.
export function SpecialDanceEntry({
  view,
  specialMode,
  judges,
  judgeNames,
  guestJudgeIds,
  nightJudgeIds,
  danceStyles,
  participants,
  otherDances,
  recentDanceTypes,
  recentDetailLabels,
  coupleName,
  canPost,
  canSetup,
  inputsDisabled,
  busy,
  nowMs,
  startInEdit = false,
  onSaveSetup,
  onDelete,
  onSaveMarks,
  onSavePoints,
  onPost,
  onUndo,
}: {
  view: SpecialDanceView;
  specialMode: boolean;
  judges: ScoringJudge[];
  judgeNames: Map<string, string>;
  guestJudgeIds: ReadonlySet<string>;
  nightJudgeIds: string[];
  danceStyles: { id: string; name: string }[];
  participants: SpecialDanceParticipant[];
  otherDances: Pick<SpecialDance, "id" | "name" | "danceType" | "memberCoupleIds">[];
  recentDanceTypes: string[];
  recentDetailLabels: string[];
  coupleName: (coupleId: string) => ReactNode;
  canPost: boolean;
  canSetup: boolean;
  inputsDisabled: boolean;
  busy: boolean;
  nowMs: number | null;
  startInEdit?: boolean;
  onSaveSetup: (dance: SpecialDanceSetupInput) => Promise<{ error: string | null; id?: string }>;
  onDelete: (teamId: string) => Promise<{ error: string | null }>;
  onSaveMarks: (teamId: string, marks: TeamMark[], markMax: number) => Promise<{ error: string | null }>;
  onSavePoints: (teamId: string, scores: SpecialDanceScore[]) => Promise<{ error: string | null }>;
  onPost: (teamId: string) => Promise<{ error: string | null }>;
  onUndo: (teamId: string) => Promise<{ error: string | null }>;
}) {
  const { dance, eligible, skipped, live } = view;
  const isNew = dance.id === NEW_SPECIAL_ID;
  const [editing, setEditing] = useState(startInEdit || isNew);
  const [setup, setSetup] = useState(() => setupFromDance(dance));
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const [markInputs, setMarkInputs] = useState<Record<string, string>>(() => marksToInputs(view.marks));
  const [pointInputs, setPointInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.scores.filter((s) => s.points != null).map((s) => [s.coupleId, String(s.points)]))
  );
  const [results, setResults] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.scores.filter((s) => s.result).map((s) => [s.coupleId, s.result!]))
  );
  const [marksDirty, setMarksDirty] = useState(false);
  const [pointsDirty, setPointsDirty] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecondStyle, setShowSecondStyle] = useState(dance.secondDanceStyleId != null);

  useEffect(() => {
    if (!editing) setSetup(setupFromDance(dance));
  }, [dance.id, dance.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedMarksKey = marksKey(view.marks);
  useEffect(() => {
    if (!marksDirty) setMarkInputs(marksToInputs(view.marks));
  }, [savedMarksKey, marksDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedScoresKey = scoresKey(view.scores);
  useEffect(() => {
    if (!pointsDirty) {
      setPointInputs(Object.fromEntries(view.scores.filter((s) => s.points != null).map((s) => [s.coupleId, String(s.points)])));
      setResults(Object.fromEntries(view.scores.filter((s) => s.result).map((s) => [s.coupleId, s.result!])));
    }
  }, [savedScoresKey, pointsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoringMode = editing ? setup.scoringMode : dance.scoringMode;
  const markMax = editing ? setup.markMax : dance.markMax;
  const panelIds = specialDancePanel(
    { panelJudgeIds: editing ? setup.panelJudgeIds : dance.panelJudgeIds },
    nightJudgeIds
  );
  const panelJudges = panelIds.map((id) => judges.find((j) => j.id === id)).filter((j): j is ScoringJudge => !!j);
  const panelOk = specialMode ? isValidPanelSize(panelIds.length) : nightJudgeIds.length === SPECIAL_DANCE_MAX_JUDGES;
  const hasSavedScores = view.marks.length > 0 || view.scores.some((s) => s.points != null);
  const posted = dance.postedAt != null;
  const scoringLocked = hasSavedScores || posted;

  const parsedMarks = parseTeamMarks(markInputs, panelIds, markMax);
  const typedMarks: TeamMark[] = panelIds.flatMap((id) => {
    const raw = (markInputs[id] ?? "").trim();
    const n = Number(raw);
    return raw !== "" && isValidMark(n, markMax) ? [{ judgeId: id, score: n }] : [];
  });
  const typedMarksKey = marksKey(typedMarks);
  const attemptedMarks = useRef(savedMarksKey);
  const pendingMarks =
    !isNew && scoringMode === "marks" && marksDirty && panelOk && parsedMarks.invalidJudgeIds.length === 0 && typedMarksKey !== savedMarksKey && attemptedMarks.current !== typedMarksKey;

  useEffect(() => {
    if (!pendingMarks || inputsDisabled) return;
    const marks = typedMarks;
    const timer = setTimeout(async () => {
      attemptedMarks.current = typedMarksKey;
      setSavingMarks(true);
      setError(null);
      const outcome = await onSaveMarks(dance.id, marks, markMax);
      setSavingMarks(false);
      if (outcome.error) setError(outcome.error);
      else setMarksDirty(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [typedMarksKey, pendingMarks, inputsDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedPoints = parseSpecialPoints(pointInputs, eligible);
  const typedScores: SpecialDanceScore[] = eligible.map((coupleId) => ({
    coupleId,
    points: pointInputs[coupleId]?.trim() === "" || pointInputs[coupleId] == null ? null : Number(pointInputs[coupleId]),
    result: results[coupleId]?.trim() || null,
  }));
  const typedScoresKey = scoresKey(typedScores);
  const attemptedScores = useRef(savedScoresKey);
  const pendingPoints =
    !isNew && scoringMode === "points" && pointsDirty && typedScoresKey !== savedScoresKey && attemptedScores.current !== typedScoresKey;

  useEffect(() => {
    if (!pendingPoints || inputsDisabled) return;
    const scores = typedScores;
    const timer = setTimeout(async () => {
      attemptedScores.current = typedScoresKey;
      setSavingPoints(true);
      setError(null);
      const outcome = await onSavePoints(dance.id, scores);
      setSavingPoints(false);
      if (outcome.error) setError(outcome.error);
      else setPointsDirty(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [typedScoresKey, pendingPoints, inputsDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = specialDanceComplete(
    { scoringMode, panelJudgeIds: editing ? setup.panelJudgeIds : dance.panelJudgeIds },
    { marks: view.marks, scores: view.scores, eligibleCoupleIds: eligible, nightJudgeIds }
  );
  const progress = specialDanceProgress(
    { scoringMode, panelJudgeIds: dance.panelJudgeIds, postedAt: dance.postedAt },
    { marks: view.marks, scores: view.scores, eligibleCoupleIds: eligible, nightJudgeIds }
  );
  const savedTotal = scoringMode === "marks" && view.marks.length === panelIds.length ? teamMarksTotal(view.marks) : null;
  const typedTotal = teamMarksTotal(typedMarks);
  const maxPossible = panelIds.length * markMax;
  const stale =
    posted &&
    live != null &&
    (scoringMode === "marks"
      ? savedTotal != null && live.total !== savedTotal
      : eligible.some((id) => (view.scores.find((s) => s.coupleId === id)?.points ?? null) !== (live.totalByCouple[id] ?? null)));
  const undoLeft = nowMs !== null && dance.postedAt ? undoSecondsLeft(dance.postedAt, nowMs) : 0;
  const styleNames = new Map(danceStyles.map((s) => [s.id, s.name]));
  const summary = specialDanceSummary(dance, styleNames);
  const typeOptions = Array.from(new Set([...DANCE_TYPE_SUGGESTIONS, ...recentDanceTypes]));
  const detailLabelOptions = Array.from(new Set([...DETAIL_LABEL_SUGGESTIONS, ...recentDetailLabels]));
  const overlapWarning = setup.danceType.trim()
    ? setup.memberCoupleIds.filter((id) =>
        otherDances.some(
          (o) =>
            o.id !== (setup.id ?? dance.id) &&
            o.danceType.trim().toLowerCase() === setup.danceType.trim().toLowerCase() &&
            o.memberCoupleIds.includes(id)
        )
      )
    : [];

  function patchSetup(patch: Partial<SpecialDanceSetupInput>) {
    setSetup((prev) => ({ ...prev, ...patch }));
    setSetupError(null);
  }

  async function handleDone() {
    const invalid = validateSpecialDanceSetup(setup, otherDances);
    if (invalid) {
      setSetupError(invalid);
      return;
    }
    setSavingSetup(true);
    setSetupError(null);
    const songs = setup.songs.filter((s) => s.title.trim());
    const outcome = await onSaveSetup({ ...setup, songs, danceType: setup.danceType.trim() });
    setSavingSetup(false);
    if (outcome.error) setSetupError(outcome.error);
    else setEditing(false);
  }

  function handleCancel() {
    setSetup(setupFromDance(dance));
    setSetupError(null);
    setShowSecondStyle(dance.secondDanceStyleId != null);
    if (!isNew) setEditing(false);
  }

  const guestNames = panelJudges.filter((j) => guestJudgeIds.has(j.id)).map((j) => judgeNames.get(j.id) ?? j.name);
  const missingNames = panelIds.filter((id) => (markInputs[id] ?? "").trim() === "").map((id) => judgeNames.get(id) ?? "a judge");
  const displayName = dance.name || automaticSpecialDanceName(setup.danceType || DEFAULT_DANCE_TYPE, otherDances, setup.id);

  let status: { tone: "muted" | "ok" | "danger" | "warn"; text: string } | null = null;
  if (isNew) {
    status = { tone: "muted", text: "Pick a Dance Type and at least one participant, then Done. Nothing is saved until then." };
  } else if (scoringMode === "marks" && parsedMarks.invalidJudgeIds.length > 0) {
    const judgeId = parsedMarks.invalidJudgeIds[0];
    status = { tone: "danger", text: `${markRangeMessage(markMax)}. ${judgeNames.get(judgeId) ?? "That"}'s ${markInputs[judgeId]?.trim()} isn't saved.` };
  } else if (scoringMode === "marks" && parsedMarks.filled < panelIds.length) {
    status = {
      tone: parsedMarks.filled === 0 ? "muted" : "warn",
      text:
        parsedMarks.filled === 0
          ? `0 of ${panelIds.length} judges in.`
          : `${parsedMarks.filled} of ${panelIds.length} judges in. Can be posted once ${oxfordJoin(missingNames)}'s score is in.`,
    };
  } else if (scoringMode === "points" && parsedPoints.invalidCoupleIds.length > 0) {
    status = { tone: "danger", text: "Points must be between −100 and 100 in steps of 0.5." };
  } else if (scoringMode === "points") {
    status = {
      tone: parsedPoints.filled === eligible.length && eligible.length > 0 ? "ok" : parsedPoints.filled === 0 ? "muted" : "warn",
      text: `${parsedPoints.filled} of ${eligible.length} ${eligible.length === 1 ? "couple has" : "couples have"} points.`,
    };
  } else if (savingMarks || pendingMarks || savingPoints || pendingPoints) {
    status = { tone: "muted", text: "Saving…" };
  } else if (posted && stale) {
    status = { tone: "warn", text: "Saved scores differ from what is live. Re-post to update every participant." };
  } else if (posted) {
    status = { tone: "ok", text: progress.label };
  } else if (complete) {
    status = { tone: "ok", text: canPost ? "Saved. Publish to add it to every participant's night." : "Saved. A site admin posts this dance." };
  }

  return (
    <div className="rounded-xl border border-accent/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          <strong>{displayName || "New Special Dance"}</strong>
          {(dance.danceType || setup.danceType) && (
            <Badge variant="secondary">{dance.danceType || setup.danceType}</Badge>
          )}
        </p>
        <div className="flex items-center gap-2">
          {posted && <Badge>Posted</Badge>}
          {canSetup && specialMode && !editing && (
            <Button size="xs" variant="ghost" onClick={() => setEditing(true)} disabled={busy} aria-label="Edit Details">
              <PencilIcon className="size-3.5" />
              Edit Details
            </Button>
          )}
        </div>
      </div>
      {!editing && (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {oxfordJoin(dance.memberCoupleIds.map((id) => participants.find((p) => p.id === id)?.celebrity ?? "a couple"))}
          </p>
          {summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
        </>
      )}

      {editing && specialMode && (
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Dance Type</Label>
            <Input
              value={setup.danceType}
              onChange={(e) => patchSetup({ danceType: e.target.value })}
              placeholder="Team Dance, Dance-Off, …"
            />
            <div className="flex flex-wrap gap-1">
              {typeOptions.map((type) => (
                <Button key={type} type="button" size="xs" variant={setup.danceType === type ? "default" : "outline"} onClick={() => patchSetup({ danceType: type })}>
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Participants</Label>
            <div className="flex flex-wrap gap-1">
              {setup.memberCoupleIds.map((id) => {
                const person = participants.find((p) => p.id === id);
                const reason = person ? participantReason(person) : null;
                return (
                  <Badge key={id} variant="secondary" className={reason ? "opacity-60" : ""}>
                    {person?.celebrity ?? "Couple"}
                    {reason ? ` · ${reason}` : ""}
                    <button
                      type="button"
                      className="ml-1"
                      aria-label={`Remove ${person?.celebrity ?? "participant"}`}
                      disabled={posted}
                      onClick={() => patchSetup({ memberCoupleIds: setup.memberCoupleIds.filter((x) => x !== id) })}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
            <Select
              items={Object.fromEntries(participants.filter((p) => !setup.memberCoupleIds.includes(p.id)).map((p) => [p.id, p.celebrity]))}
              value={null}
              onValueChange={(v) => {
                if (v) patchSetup({ memberCoupleIds: [...setup.memberCoupleIds, v] });
              }}
              disabled={posted}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={posted ? "Un-post to change participants" : "Add a participant"} />
              </SelectTrigger>
              <SelectContent>
                {participants
                  .filter((p) => !setup.memberCoupleIds.includes(p.id))
                  .map((p) => {
                    const reason = participantReason(p);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.celebrity} & {p.pro}
                        {reason ? ` · ${reason}` : ""}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
            {overlapWarning.length > 0 && (
              <p className="text-xs text-amber-text">
                {oxfordJoin(overlapWarning.map((id) => participants.find((p) => p.id === id)?.celebrity ?? "A couple"))}{" "}
                {overlapWarning.length === 1 ? "is" : "are"} already in another {setup.danceType || "special dance"} tonight.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Style</Label>
            <Select
              items={Object.fromEntries(danceStyles.map((s) => [s.id, s.name]))}
              value={setup.danceStyleId}
              onValueChange={(v) => patchSetup({ danceStyleId: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {danceStyles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showSecondStyle || setup.secondDanceStyleId ? (
              <Select
                items={Object.fromEntries(danceStyles.map((s) => [s.id, s.name]))}
                value={setup.secondDanceStyleId}
                onValueChange={(v) => patchSetup({ secondDanceStyleId: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Second style" />
                </SelectTrigger>
                <SelectContent>
                  {danceStyles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button type="button" size="xs" variant="ghost" className="self-start" onClick={() => setShowSecondStyle(true)}>
                + Add Second Style
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Song</Label>
            {setup.songs.map((song, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={song.title}
                  placeholder={i === 0 ? "Song title" : `Song ${i + 1}`}
                  onChange={(e) =>
                    patchSetup({
                      songs: setup.songs.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                    })
                  }
                />
                {setup.songs.length > 1 && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Remove song"
                    onClick={() => patchSetup({ songs: setup.songs.filter((_, j) => j !== i) })}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {setup.songs.length < SPECIAL_DANCE_MAX_SONGS && (
              <Button type="button" size="xs" variant="ghost" className="self-start" onClick={() => patchSetup({ songs: [...setup.songs, { title: "", artist: null }] })}>
                + Add Another Song
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Scoring</Label>
            <div className="flex gap-1">
              {(["marks", "points"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={setup.scoringMode === mode ? "default" : "outline"}
                  disabled={scoringLocked}
                  onClick={() => patchSetup({ scoringMode: mode, panelJudgeIds: mode === "points" ? null : setup.panelJudgeIds })}
                >
                  {mode === "marks" ? "Judges' Marks" : "Points per Couple"}
                </Button>
              ))}
            </div>
            {scoringLocked && (
              <p className="text-xs text-muted-foreground">
                {posted ? "Un-post first to change how this is scored." : "Clear the saved scores to change the mode, panel, or max."}
              </p>
            )}
            {setup.scoringMode === "marks" && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Out of</Label>
                  <Select
                    items={Object.fromEntries(MARK_MAX_OPTIONS.map((n) => [String(n), String(n)])) }
                    value={String(setup.markMax)}
                    onValueChange={(v) => patchSetup({ markMax: Number(v) })}
                    disabled={scoringLocked}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARK_MAX_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  {judges.filter((j) => nightJudgeIds.includes(j.id)).map((j) => {
                    const ticked = setup.panelJudgeIds == null || setup.panelJudgeIds.includes(j.id);
                    return (
                      <label key={j.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ticked}
                          disabled={scoringLocked}
                          onChange={(e) => {
                            const night = nightJudgeIds;
                            const current = setup.panelJudgeIds ?? night;
                            const next = e.target.checked ? [...new Set([...current, j.id])] : current.filter((id) => id !== j.id);
                            const sameAsNight = next.length === night.length && night.every((id) => next.includes(id));
                            patchSetup({ panelJudgeIds: sameAsNight ? null : next });
                          }}
                        />
                        <span className={guestJudgeIds.has(j.id) ? "text-accent" : ""}>
                          {judgeNames.get(j.id) ?? j.name}
                          {guestJudgeIds.has(j.id) ? " · Guest" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">{ticked ? "" : "Didn't judge"}</span>
                      </label>
                    );
                  })}
                </div>
                {setup.panelJudgeIds && !isValidPanelSize(setup.panelJudgeIds.length) && (
                  <p className="text-xs text-amber-text">
                    Judges&apos; Marks need {SPECIAL_DANCE_MIN_JUDGES} to {SPECIAL_DANCE_MAX_JUDGES} judges.
                  </p>
                )}
              </>
            )}
          </div>

          <Accordion defaultValue={[]}>
            <AccordionItem value="more">
              <AccordionTrigger>More Details</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3">
                {setup.songs.map((song, i) => (
                  <div key={`artist-${i}`} className="flex flex-col gap-1">
                    <Label className="text-xs">Artist{setup.songs.length > 1 ? ` · ${song.title || `Song ${i + 1}`}` : ""}</Label>
                    <Input
                      value={song.artist ?? ""}
                      onChange={(e) =>
                        patchSetup({
                          songs: setup.songs.map((s, j) => (j === i ? { ...s, artist: e.target.value || null } : s)),
                        })
                      }
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Team Name</Label>
                  <Input
                    value={setup.name}
                    placeholder={automaticSpecialDanceName(setup.danceType || DEFAULT_DANCE_TYPE, otherDances, setup.id)}
                    onChange={(e) => patchSetup({ name: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Blank uses the Dance Type, numbered when there is more than one.</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Theme / Source</Label>
                  <div className="flex gap-1.5">
                    <Select
                      items={Object.fromEntries(THEME_LABELS.map((l) => [l, l]))}
                      value={setup.themeLabel}
                      onValueChange={(v) => patchSetup({ themeLabel: v })}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Label" />
                      </SelectTrigger>
                      <SelectContent>
                        {THEME_LABELS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={setup.songSource ?? ""} onChange={(e) => patchSetup({ songSource: e.target.value || null })} placeholder="Zootopia 2" />
                  </div>
                </div>
                {setup.scoringMode === "points" && setup.memberCoupleIds.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Result per participant is entered with their points, below, once this dance is saved.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex flex-col gap-1.5">
            <Label>Extra Details</Label>
            {setup.details.map((detail, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-lg border border-border p-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={detail.label}
                    placeholder="Label"
                    className="w-32"
                    onChange={(e) =>
                      patchSetup({ details: setup.details.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)) })
                    }
                  />
                  <Input
                    value={detail.value}
                    placeholder="Value"
                    onChange={(e) =>
                      patchSetup({
                        details: setup.details.map((d, j) => (j === i ? { ...d, value: e.target.value, coupleId: null } : d)),
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Remove detail"
                    onClick={() => patchSetup({ details: setup.details.filter((_, j) => j !== i) })}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {detailLabelOptions.map((label) => (
                    <Button
                      key={label}
                      type="button"
                      size="xs"
                      variant={detail.label === label ? "default" : "ghost"}
                      onClick={() => patchSetup({ details: setup.details.map((d, j) => (j === i ? { ...d, label } : d)) })}
                    >
                      {label}
                    </Button>
                  ))}
                  {setup.memberCoupleIds.map((id) => {
                    const person = participants.find((p) => p.id === id);
                    if (!person) return null;
                    return (
                      <Button
                        key={id}
                        type="button"
                        size="xs"
                        variant={detail.coupleId === id ? "default" : "ghost"}
                        onClick={() =>
                          patchSetup({
                            details: setup.details.map((d, j) => (j === i ? { ...d, value: person.celebrity, coupleId: id } : d)),
                          })
                        }
                      >
                        {person.celebrity}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
            {setup.details.length < SPECIAL_DANCE_MAX_DETAILS && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="self-start"
                onClick={() => patchSetup({ details: [...setup.details, { label: "", value: "", coupleId: null } satisfies SpecialDanceDetail] })}
              >
                + Add Detail
              </Button>
            )}
          </div>

          {setupError && (
            <p role="alert" className="text-xs text-danger-text">
              {setupError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleDone()} disabled={savingSetup || busy}>
              {savingSetup ? "Saving…" : "Done"}
            </Button>
            <Button variant="ghost" onClick={handleCancel} disabled={savingSetup}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              className="text-danger-text"
              disabled={posted || isNew || savingSetup || busy}
              title={posted ? "Un-post first" : undefined}
              onClick={async () => {
                if (isNew) return;
                setSavingSetup(true);
                const outcome = await onDelete(dance.id);
                setSavingSetup(false);
                if (outcome.error) setSetupError(outcome.error);
              }}
            >
              {posted ? "Un-post first" : "Remove Special Dance"}
            </Button>
          </div>
        </div>
      )}

      {!isNew && scoringMode === "marks" && (
        panelOk ? (
          <fieldset disabled={inputsDisabled || busy} className="mt-1.5 flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-1.5">
              <div className="flex flex-wrap items-end gap-1.5">
                {panelJudges.map((j) => (
                  <div key={j.id} className="flex flex-col gap-0.5">
                    <Label className={`text-[10px] ${guestJudgeIds.has(j.id) ? "text-accent" : "text-muted-foreground"}`}>
                      {judgeNames.get(j.id) ?? j.name}
                    </Label>
                    <Input
                      inputMode="decimal"
                      aria-label={`${judgeNames.get(j.id) ?? j.name} mark for ${displayName}`}
                      className={`h-8 w-12 px-1.5 text-center text-xs ${parsedMarks.invalidJudgeIds.includes(j.id) ? "border-destructive" : ""}`}
                      placeholder="—"
                      value={markInputs[j.id] ?? ""}
                      onChange={(e) => {
                        setMarksDirty(true);
                        setError(null);
                        setMarkInputs((prev) => ({ ...prev, [j.id]: e.target.value }));
                      }}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">Total</Label>
                  <p className="flex h-8 items-center px-1 text-sm font-medium">
                    {typedTotal}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">/{maxPossible}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-muted-foreground">
                <span>0 to {markMax} in steps of 0.5</span>
                <span>
                  {guestNames.length > 0 ? `${oxfordJoin(guestNames)} ${guestNames.length === 1 ? "is" : "are"} tonight's guest · ` : ""}
                  {parsedMarks.filled} of {panelIds.length} in
                </span>
              </div>
            </div>
          </fieldset>
        ) : (
          <div role="alert" className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-text">
            {specialMode
              ? `This dance needs ${SPECIAL_DANCE_MIN_JUDGES} to ${SPECIAL_DANCE_MAX_JUDGES} judges and has ${panelIds.length}.`
              : `Team Dances need exactly ${SPECIAL_DANCE_MAX_JUDGES} judges and this night has ${nightJudgeIds.length}.`}{" "}
            <Link href="/admin/schedule" className="font-semibold underline underline-offset-2">
              Set the guest judge on Schedule
            </Link>{" "}
            or choose its judges under Edit Details.
          </div>
        )
      )}

      {!isNew && scoringMode === "points" && (
        <fieldset disabled={inputsDisabled || busy} className="mt-1.5 flex flex-col gap-1 rounded-lg bg-muted/50 p-1.5">
          {eligible.map((coupleId) => {
            const person = participants.find((p) => p.id === coupleId);
            return (
              <div key={coupleId} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-24 flex-1 text-sm">{coupleName(coupleId)}</span>
                <Input
                  inputMode="decimal"
                  aria-label={`Points for ${person?.celebrity ?? "this couple"}`}
                  className={`h-8 w-16 px-1.5 text-center text-xs ${parsedPoints.invalidCoupleIds.includes(coupleId) ? "border-destructive" : ""}`}
                  placeholder="—"
                  value={pointInputs[coupleId] ?? ""}
                  onChange={(e) => {
                    setPointsDirty(true);
                    setError(null);
                    setPointInputs((prev) => ({ ...prev, [coupleId]: e.target.value }));
                  }}
                />
                <Select
                  items={Object.fromEntries(RESULT_SUGGESTIONS.map((r) => [r, r]))}
                  value={results[coupleId] ?? null}
                  onValueChange={(v) => {
                    setPointsDirty(true);
                    setResults((prev) => ({ ...prev, [coupleId]: v ?? "" }));
                  }}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue placeholder="Result" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_SUGGESTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {eligible.length === 0 && <p className="text-xs text-muted-foreground">No eligible participants tonight.</p>}
        </fieldset>
      )}

      {status && !editing && (
        <p
          role={status.tone === "danger" ? "alert" : undefined}
          className={`mt-1.5 rounded-lg border px-3 py-2 text-xs ${
            status.tone === "danger"
              ? "border-destructive/40 bg-destructive/10 text-danger-text"
              : status.tone === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-text"
                : status.tone === "ok"
                  ? "border-emerald/40 bg-emerald/10 text-emerald-text"
                  : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {status.text}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger-text">
          {error}
        </p>
      )}

      {!isNew && (
        <div className="mt-2 flex flex-col rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>
              Applies to {eligible.length} of {dance.memberCoupleIds.length} {dance.memberCoupleIds.length === 1 ? "couple" : "couples"}
            </span>
          </div>
          {dance.memberCoupleIds.map((coupleId) => {
            const skip = skipped.find((s) => s.coupleId === coupleId);
            const carries = live?.coupleIds.includes(coupleId) ?? false;
            const points = view.scores.find((s) => s.coupleId === coupleId);
            const label = skip
              ? SKIP_LABEL[skip.reason]
              : carries
                ? stale
                  ? "Posted · Old Score"
                  : points?.result
                    ? `Posted · ${points.result}`
                    : "Posted"
                : posted
                  ? "Will Post on Re-post"
                  : "Will Post";
            const tone = skip ? "text-amber-text" : carries ? (stale ? "text-amber-text" : "text-emerald-text") : "text-muted-foreground";
            return (
              <div key={coupleId} className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-2.5 py-1 text-sm last:border-b-0">
                <span className="flex flex-wrap items-center gap-1.5">{coupleName(coupleId)}</span>
                <span className={`shrink-0 text-xs ${tone}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {canPost && !isNew && (scoringMode === "points" || panelOk) && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {posted ? (
              <>
                <Button
                  variant="ghost"
                  className="text-danger-text"
                  disabled={busy || posting}
                  onClick={async () => {
                    setPosting(true);
                    setError(null);
                    const outcome = await onUndo(dance.id);
                    setPosting(false);
                    if (outcome.error) setError(outcome.error);
                  }}
                >
                  {undoLeft > 0 ? `Undo · ${undoLeft}s` : scoringMode === "points" ? "Un-Post" : "Un-Post Team"}
                </Button>
                {stale && (
                  <Button
                    disabled={busy || posting || !complete}
                    onClick={async () => {
                      setPosting(true);
                      setError(null);
                      const outcome = await onPost(dance.id);
                      setPosting(false);
                      if (outcome.error) setError(outcome.error);
                    }}
                  >
                    {posting ? "Posting…" : "Re-post"}
                  </Button>
                )}
              </>
            ) : (
              <Button
                disabled={busy || posting || !complete || eligible.length === 0}
                onClick={async () => {
                  setPosting(true);
                  setError(null);
                  const outcome = await onPost(dance.id);
                  setPosting(false);
                  if (outcome.error) setError(outcome.error);
                }}
              >
                {posting ? "Publishing…" : scoringMode === "points" ? "Publish" : "Publish Team"}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {posted
              ? "This score is live for every eligible participant. Each couple's own dance posts separately."
              : "Posts this score to every eligible participant, whether or not their own dance is posted yet."}
          </p>
        </div>
      )}
    </div>
  );
}
