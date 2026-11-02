"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  saveEpisodeDraft,
  revealCoupleScores,
  undoCoupleReveal,
  addEpisodeCustomMoment,
  removeEpisodeCustomMoment,
  publishEpisodeResults,
  releaseDraftCoupleAction,
  startEpisodeCorrection,
  withdrawDraftCoupleAction,
  saveSpecialDanceAction,
  saveSpecialDancePointsAction,
  deleteSpecialDanceAction,
  saveTeamMarksAction,
  revealTeamScores,
  undoTeamScores,
} from "@/app/admin/results/actions";
import { TeamEntry, type ApplyOutcome, type TeamEntryView } from "@/components/team-entry";
import { SpecialDanceEntry, blankSpecialDance, type SpecialDanceView } from "@/components/special-dance-entry";
import type { TeamsMode } from "@/lib/episode-teams";
import {
  ADD_SPECIAL_VALUE,
  NEW_SPECIAL_ID,
  coupleIdsForDraft,
  teamPickValue,
} from "@/lib/results-draft-input";
import {
  DANCE_TYPE_SUGGESTIONS,
  DETAIL_LABEL_SUGGESTIONS,
  appliedTeamMarks,
  buildNightSummary,
  eligibleTeamMembers,
  inferTeamsFromRows,
  isTeamDanceRow,
  isTeamStyleName,
  oxfordJoin,
  recentSuggestions,
  specialDanceComplete,
  specialDancePanel,
  teamApplyPlan,
  teamMarksTotal,
  type NightSummaryDance,
  type SpecialDance,
  type SpecialDanceScore,
  type SpecialDanceSetupInput,
  type TeamMark,
} from "@/lib/team-dances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOTTOM_NAV_STACK_ABOVE } from "@/components/bottom-nav";
import { DraftSaveQueue } from "@/lib/draft-save-queue";
import { couplesRevealState, undoSecondsLeft } from "@/lib/reveal-state";
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
import { collapseToNights, scaledJudgesScore } from "@/lib/scoring";
import { formatPoints } from "@/lib/format-points";

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
  expected_dance_count: number;
  judges_save_available: boolean;
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
  inJeopardy: boolean;
  savedByJudges: boolean;
  hadImmunity: boolean;
  bonusPoints: number;
  bonusNote: string;
  dances: RowDance[];
};

function emptyRow(): CoupleRow {
  return {
    outcome: "safe",
    inJeopardy: false,
    savedByJudges: false,
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

function coupleTotal(row: CoupleRow): number {
  return row.dances.reduce((sum, d) => sum + danceTotal(d), 0);
}

// "64/80 → 24.00": the night's raw total over every mark possible, and the
// 30-point basis Dance Card pays on, through the same collapse the engine
// uses. The arrow only appears when the two differ (a guest judge or a
// second dance), so a plain three-judge dance reads "28/30".
function nightPreview(row: CoupleRow, coupleId: string): string | null {
  const dances = row.dances.flatMap((d) => {
    const marks = Object.values(d.scores)
      .filter((v) => v.trim() !== "")
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (marks.length === 0) return [];
    return [{ episodeId: "", coupleId, totalScore: marks.reduce((sum, n) => sum + n, 0), scaledScore: scaledJudgesScore(marks), maxScore: marks.length * 10 }];
  });
  if (dances.length === 0) return null;
  const [night] = collapseToNights(dances);
  const basis = night.scaledScore === night.totalScore ? "" : ` → ${formatPoints(night.scaledScore)}`;
  return `${night.totalScore}/${night.maxScore}${basis}`;
}

function isPerfectScore(dance: RowDance, judgeCount: number): boolean {
  const entered = Object.values(dance.scores).filter((v) => v !== "");
  if (entered.length === 0 || entered.length < judgeCount) return false;
  return entered.every((v) => Number(v) === 10);
}

function buildRowsFromDraft(
  draft: DraftState | undefined,
  couples: Couple[],
  expectedDanceCount: number,
  teamByCouple: ReadonlyMap<string, SpecialDance>
): Record<string, CoupleRow> {
  const inJeopardy = new Set(draft?.inJeopardyCoupleIds ?? []);
  const rows: Record<string, CoupleRow> = {};
  for (const c of couples) rows[c.id] = { ...emptyRow(), inJeopardy: inJeopardy.has(c.id) };

  for (const entry of draft?.entries ?? []) {
    rows[entry.coupleId] = {
      outcome: entry.outcome,
      inJeopardy: entry.outcome !== "eliminated" && inJeopardy.has(entry.coupleId),
      savedByJudges: entry.savedByJudges,
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

  // A couple's dance rows default to however many dances the episode expects,
  // so entry is fill-in-the-blanks rather than a "+ Dance" click per row. A
  // Did Not Dance couple gets none. A team member's team dance arrives from
  // the Team Dances card, so one slot is held for it instead of left blank.
  for (const coupleId of Object.keys(rows)) {
    const row = rows[coupleId];
    if (row.outcome === "bye") continue;
    const team = teamByCouple.get(coupleId);
    const teamRows = team ? row.dances.filter((d) => isTeamDanceRow(team, d)).length : 0;
    const reserved = team && teamRows === 0 ? 1 : 0;
    // A member always keeps one slot for their own dance, even on a night
    // scheduled with a single dance per couple.
    const fillCount = Math.max(
      expectedDanceCount - row.dances.length - reserved,
      row.dances.length - teamRows === 0 ? 1 : 0
    );
    if (fillCount <= 0) continue;
    rows[coupleId] = {
      ...row,
      dances: [
        ...row.dances,
        ...Array.from({ length: fillCount }, (_, i) => ({
          key: `slot-${coupleId}-${row.dances.length + i}`,
          danceStyleId: "",
          songTitle: "",
          scores: {},
        })),
      ],
    };
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
  revealedByEpisode,
  releasedCoupleIdsByEpisode,
  forceSelectEpisodeId,
  participantsByEpisode,
  guestJudgesByEpisode,
  roundTypesByEpisode,
  teamsMode,
  teamsByEpisode,
  teamMarksByTeam,
  teamScoresByTeam,
  teamLiveByTeam,
  revealedDancesByEpisode,
}: {
  // Trusted contributors draft results; only site admins publish or correct.
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
  revealedByEpisode: Record<string, Record<string, string>>;
  releasedCoupleIdsByEpisode: Record<string, string[]>;
  // From /admin/results/enter?episode= (Scores' "Continue in Enter Results"),
  // to open already pointed at that episode.
  forceSelectEpisodeId?: string | null;
  participantsByEpisode: Record<string, string[]>;
  guestJudgesByEpisode: Record<string, string[]>;
  roundTypesByEpisode: Record<string, string[]>;
  // "entity" once supabase/apply-team-dance-entity.sql is applied: teams are
  // saved rows with marks of their own and post separately. "inferred" until
  // then: teams are read off the couples' slot-2 rows (the fallback).
  teamsMode: TeamsMode;
  teamsByEpisode: Record<string, SpecialDance[]>;
  teamMarksByTeam: Record<string, TeamMark[]>;
  teamScoresByTeam: Record<string, SpecialDanceScore[]>;
  teamLiveByTeam: Record<string, { total: number; coupleIds: string[]; totalByCouple: Record<string, number> }>;
  revealedDancesByEpisode: Record<string, Record<string, { danceStyleId: string; songTitle: string | null; totalScore: number }[]>>;
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
  const mostRecentPublishedWeekNumber = Math.max(
    0,
    ...episodes
      .filter((e) => e.results_published_at)
      .map((e) => (e.week_id ? (weekById.get(e.week_id)?.week_number ?? 0) : 0))
  );
  const router = useRouter();

  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");

  useEffect(() => {
    if (forceSelectEpisodeId) setSelectedEpisodeId(forceSelectEpisodeId);
  }, [forceSelectEpisodeId]);

  const selectedEpisode = sortedEpisodes.find((e) => e.id === selectedEpisodeId) ?? null;
  const expectedDanceCount = selectedEpisode?.expected_dance_count ?? 1;
  const judgesSaveAvailable = selectedEpisode?.judges_save_available ?? false;
  const selectedWeek = selectedEpisode?.week_id ? (weekById.get(selectedEpisode.week_id) ?? null) : null;
  const isFinale = selectedWeek?.is_finale ?? false;
  const nightsCount = selectedEpisode?.week_id ? (nightsCountByWeek.get(selectedEpisode.week_id) ?? 1) : 1;

  // Upcoming / unpublished: still-competing cast only, so an already-voted-off
  // couple can't be scored again. Published weeks keep whoever was still in
  // as of that week (and anyone already on the correction draft) so history
  // stays editable.
  const published = selectedEpisode?.results_published_at != null;
  const revealedAtByCouple = revealedByEpisode[selectedEpisode?.id ?? ""] ?? {};
  const revealedCoupleIds = new Set(published ? [] : Object.keys(revealedAtByCouple));
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

  const entity = teamsMode !== "inferred";
  const special = teamsMode === "special";
  const persistedTeams = selectedEpisode ? (teamsByEpisode[selectedEpisode.id] ?? []) : [];
  // Team rows never live in a draft, so hydration holds no slot for them.
  const persistedTeamByCouple = new Map<string, SpecialDance>();
  const teamDanceTicked = (roundTypesByEpisode[selectedEpisode?.id ?? ""] ?? []).includes("Team Dance");
  // Ticking Team Dance under Round Types on Schedule is what brings the card
  // out; saved teams keep it out even if the tick is later removed.
  const isTeamNight = persistedTeams.length > 0 || teamDanceTicked;
  // The night's panel: the standing judges plus this episode's guests.
  const nightJudges = judgesForScoreInputs(judges, [], guestJudgesByEpisode[selectedEpisode?.id ?? ""] ?? []);
  const teamStyleIds = new Set(danceStyles.filter((s) => isTeamStyleName(s.name)).map((s) => s.id));
  const freestyleStyleId =
    danceStyles.find((s) => s.name.trim().toLowerCase() === "freestyle")?.id ?? danceStyles[0]?.id ?? "";

  const [rows, setRows] = useState<Record<string, CoupleRow>>({});
  const [customMoments, setCustomMoments] = useState<DraftState["customMoments"]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releasedCoupleIds, setReleasedCoupleIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [seedingCorrection, setSeedingCorrection] = useState(false);
  const [coupleViewMode, setCoupleViewMode] = useState<"inProgress" | "drafted" | "published">("inProgress");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [byCoupleSelectedId, setByCoupleSelectedId] = useState("");
  const [draftedSelectedId, setDraftedSelectedId] = useState("");
  const [publishedSelectedId, setPublishedSelectedId] = useState("");
  // Published couples default to locked/read-only in a correction (every
  // couple in a published episode is already fully editable in the draft
  // underneath -- this just narrows which one the UI lets you touch at a
  // time, instead of throwing the whole night open at once).
  const [unlockedForCorrectionCoupleIds, setUnlockedForCorrectionCoupleIds] = useState<Set<string>>(new Set());

  const [revealBusy, setRevealBusy] = useState(false);
  // Null until mounted so the undo countdown never renders a server clock.
  const [nowMs, setNowMs] = useState<number | null>(null);

  // With no saved team, a Team Dance night's teams are the couples whose
  // second slot shares a Freestyle and a song -- what the live draft already
  // holds -- so the card works before the migration is applied.
  const inferredTeams =
    !entity && persistedTeams.length === 0 && teamDanceTicked && selectedEpisode
      ? inferTeamsFromRows(
          selectedEpisode.id,
          episodeCouples.map((c) => ({ coupleId: c.id, dances: (rows[c.id] ?? emptyRow()).dances.filter((d) => d.danceStyleId) })),
          teamStyleIds
        )
      : [];
  const episodeTeams = persistedTeams.length > 0 ? persistedTeams : inferredTeams;
  const teamByCouple = new Map<string, SpecialDance>(
    episodeTeams.flatMap((team) => team.memberCoupleIds.map((coupleId) => [coupleId, team] as const))
  );

  const [confirmNoElimination, setConfirmNoElimination] = useState(false);
  // A team member about to be posted before their team is scored (frame 07).
  const [confirmPublishTeamMember, setConfirmPublishTeamMember] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [draftSpecial, setDraftSpecial] = useState<SpecialDance | null>(null);
  // Couples whose last edit was refused because they were posted in between.
  const [postedSkipNotice, setPostedSkipNotice] = useState<string[]>([]);
  const [customMomentLabel, setCustomMomentLabel] = useState("");
  const [customMomentCoupleId, setCustomMomentCoupleId] = useState("");
  const [addingCustomMoment, setAddingCustomMoment] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraftRef = useRef<() => Promise<{ error: string | null }>>(async () => ({ error: null }));
  const draftSavedAgo = useRelativeTimeAgo(draftSavedAt);

  // saveEpisodeDraft's revalidatePath("/admin/results", "layout") makes Next
  // auto-refresh this route's server props for the client that called it —
  // including draftsByEpisode — which would otherwise re-trigger the
  // rehydrate effect below and stomp whatever the admin has typed since.
  // Sidesteps that by having flushDraft mark which episode it just saved,
  // and the effect skips exactly that one self-triggered refresh.
  const justSavedEpisodeId = useRef<string | null>(null);
  const previousEpisodeId = useRef<string | null>(null);
  // Guards against firing startEpisodeCorrection more than once while its
  // own revalidatePath round trip is what actually brings the seeded draft
  // back into draftsByEpisode and re-triggers this effect.
  const seedingEpisodeId = useRef<string | null>(null);
  // Couples edited since the last successful save. flushDraft only sends
  // these, never the whole roster, so a concurrent save from someone else
  // editing different couples can't silently wipe their rows.
  const draftSaveQueue = useRef(new DraftSaveQueue());
  const draftInputRef = useRef(buildDraftInput);

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
  // Selecting an already-published episode with no draft yet transparently
  // seeds one from live data first (what "Correct Results" used to do as a
  // separate step on the Scores page) — Enter Results is where corrections
  // happen now, not a button on a view-only page.
  useEffect(() => {
    if (!selectedEpisode) return;
    // Only a genuine switch to a *different* episode should dismiss the
    // "just published" banner — Publish's own revalidation re-runs this
    // same effect for the episode that was just published (to pick up its
    // fresh results_published_at), which must leave the banner alone.
    if (previousEpisodeId.current !== selectedEpisode.id) {
      previousEpisodeId.current = selectedEpisode.id;
      setJustPublished(false);
      setByCoupleSelectedId("");
      setDraftedSelectedId("");
      setShowLeaderboard(false);
      setUnlockedForCorrectionCoupleIds(new Set());
      setCoupleViewMode(selectedEpisode.results_published_at != null ? "published" : "inProgress");
      setPostedSkipNotice([]);
      draftSaveQueue.current.reset();
    }
    const wasSelfTriggered = justSavedEpisodeId.current === selectedEpisode.id;
    justSavedEpisodeId.current = null;
    if (!wasSelfTriggered) setReleasedCoupleIds(new Set(releasedCoupleIdsByEpisode[selectedEpisode.id] ?? []));
    if (wasSelfTriggered) return;
    const draft = draftsByEpisode[selectedEpisode.id];

    if (canPublish && selectedEpisode.results_published_at != null && !draft?.hasDraft) {
      if (seedingEpisodeId.current !== selectedEpisode.id) {
        seedingEpisodeId.current = selectedEpisode.id;
        setSeedingCorrection(true);
        setRows({});
        setCustomMoments([]);
        setHasDraft(false);
        setError(null);
        draftSaveQueue.current.reset();
        startEpisodeCorrection(selectedEpisode.id).then((result) => {
          if (result.error) {
            seedingEpisodeId.current = null;
            setSeedingCorrection(false);
            setError(result.error);
          }
          // On success, its revalidatePath brings the seeded draft back
          // into draftsByEpisode, which re-runs this effect and hydrates
          // rows from it below.
        });
      }
      return;
    }
    seedingEpisodeId.current = null;
    setSeedingCorrection(false);
    setRows(buildRowsFromDraft(draft, episodeCouples, expectedDanceCount, persistedTeamByCouple));
    setCustomMoments(draft?.customMoments ?? []);
    setDraftSavedAt(draft?.updatedAt ?? null);
    setHasDraft(draft?.hasDraft ?? false);
    setError(null);
    // Depends on the draft's own updatedAt/hasDraft, not just the episode
    // id, so a fresh draft (whether from a save or the seed above) still
    // triggers a rehydrate even though the id didn't change.
  }, [selectedEpisode?.id, selectedEpisode?.results_published_at, draftsByEpisode[selectedEpisode?.id ?? ""]?.updatedAt, draftsByEpisode[selectedEpisode?.id ?? ""]?.hasDraft, releasedCoupleIdsByEpisode[selectedEpisode?.id ?? ""]?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const status: EpisodeResultsStatus | null = selectedEpisode
    ? deriveResultsStatus({ results_published_at: selectedEpisode.results_published_at }, hasDraft, revealedCoupleIds.size > 0)
    : null;

  // Super admins publish a couple at a time; everyone else only saves drafts.
  const publishPerCouple = canPublish && !!selectedEpisode && !published;
  const revealStates = couplesRevealState(
    episodeCouples.flatMap((c) =>
      (rows[c.id] ?? emptyRow()).dances
        .filter((d) => d.danceStyleId)
        .map((d) => ({ coupleId: c.id, judgeScores: Object.values(d.scores).filter((v) => v !== "").map((v) => ({ score: Number(v) })) }))
    ),
    revealedCoupleIds
  );
  const unpostedCount = revealStates.size - episodeCouples.filter((c) => revealStates.get(c.id) === "posted").length;

  const scoredCouples = episodeCouples.filter((c) =>
    (rows[c.id] ?? emptyRow()).dances.some((d) => Object.values(d.scores).some((v) => v !== ""))
  );
  // Once the whole episode is officially published, every couple in it is
  // published -- there's no "still drafting" distinction left to make.
  const publishedCouples = published ? episodeCouples : episodeCouples.filter((c) => revealedCoupleIds.has(c.id));
  const draftedCouples = published ? [] : episodeCouples.filter((c) => releasedCoupleIds.has(c.id) && !revealedCoupleIds.has(c.id));
  const inProgressCouples = published
    ? []
    : episodeCouples.filter((c) => !releasedCoupleIds.has(c.id) && !revealedCoupleIds.has(c.id));
  const eliminatedCount = episodeCouples.filter((c) => (rows[c.id] ?? emptyRow()).outcome === "eliminated").length;
  const requiredEliminations = selectedWeek?.is_double_elimination_week ? 2 : 1;

  const postedTeamCount = persistedTeams.filter((t) => t.postedAt != null).length;
  useEffect(() => {
    if (revealedCoupleIds.size === 0 && postedTeamCount === 0) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [revealedCoupleIds.size, postedTeamCount]);

  // Only the couples actually edited since the last save -- see
  // draftSaveQueue's comment. A stale coupleId (removed from the entry list
  // since it was marked dirty) is dropped rather than sent.
  function buildDraftInput(ids: string[]) {
    const known = new Set(episodeCouples.map((c) => c.id));
    const dirtyCouples = episodeCouples.filter((c) => coupleIdsForDraft(ids, known).includes(c.id));
    return {
      episodeId: selectedEpisode!.id,
      correctionToken: draftsByEpisode[selectedEpisode!.id]?.correctionToken ?? null,
      // Caption column is no longer editable here (it never drove scores or
      // display). Pass through any stored value so a draft save doesn't wipe it.
      guestJudgeName: draftsByEpisode[selectedEpisode!.id]?.guestJudgeName ?? null,
      judgesSaveAvailable,
      entries: dirtyCouples.map((c) => {
        const row = rows[c.id] ?? emptyRow();
        return {
          coupleId: c.id,
          dances: row.dances
            .filter((d) => d.danceStyleId)
            .map((d) => ({
              danceStyleId: d.danceStyleId,
              songTitle: d.songTitle.trim() || null,
              judgeScores: Object.entries(d.scores)
                .filter(([, v]) => v.trim() !== "")
                .map(([judgeId, v]) => ({ judgeId, score: Number(v) })),
            })),
          outcome: row.outcome,
          savedByJudges: row.savedByJudges,
          hadImmunity: row.hadImmunity,
          bonusPoints: row.bonusPoints,
          bonusNote: row.bonusNote.trim() || null,
        };
      }),
      inJeopardyCoupleIds: dirtyCouples
        .filter((c) => {
          const row = rows[c.id] ?? emptyRow();
          return row.inJeopardy && row.outcome !== "eliminated";
        })
        .map((c) => c.id),
    };
  }

  draftInputRef.current = buildDraftInput;

  async function flushDraft(): Promise<{ error: string | null }> {
    if (!selectedEpisode) return { error: null };
    setSavingDraft(true);
    const result = await draftSaveQueue.current.flush(
      (ids) => draftInputRef.current(ids),
      async (input) => {
        justSavedEpisodeId.current = input.episodeId;
        const saved = await saveEpisodeDraft(input);
        if (!saved.error) {
          setDraftSavedAt(new Date().toISOString());
          setHasDraft(true);
        }
        return { error: saved.error, acknowledgedIds: saved.acknowledgedIds, skippedIds: saved.skippedPostedIds };
      }
    );
    setError(result.error);
    if (result.skippedIds && result.skippedIds.length > 0) {
      // Those couples were posted while a dance edit was in flight. Say so,
      // and put their dances back to what the server holds rather than keep
      // showing marks that never landed; outcome edits did save.
      const skipped = new Set(result.skippedIds);
      const serverRows = buildRowsFromDraft(
        draftsByEpisode[selectedEpisode.id],
        episodeCouples.filter((c) => skipped.has(c.id)),
        expectedDanceCount,
        persistedTeamByCouple
      );
      setRows((prev) => {
        const next = { ...prev };
        for (const [coupleId, serverRow] of Object.entries(serverRows)) {
          next[coupleId] = { ...(prev[coupleId] ?? emptyRow()), dances: serverRow.dances };
        }
        return next;
      });
      setPostedSkipNotice(result.skippedIds);
    }
    setSavingDraft(false);
    return result;
  }

  // The team dance in page state: the member's existing team row (found by
  // signature, never by slot) takes the marks, or one is appended.
  function writeTeamMarksIntoRows(team: SpecialDance, marks: TeamMark[], coupleIds: Iterable<string>) {
    const scores = Object.fromEntries(marks.map((m) => [m.judgeId, String(m.score)]));
    setRows((prev) => {
      const next = { ...prev };
      for (const coupleId of coupleIds) {
        const row = next[coupleId] ?? emptyRow();
        const existing = row.dances.find((d) => isTeamDanceRow(team, d));
        const teamRow: RowDance = {
          key: existing?.key ?? `team-${team.id}-${coupleId}`,
          danceStyleId: team.danceStyleId,
          songTitle: existing?.songTitle ?? team.songTitle ?? "",
          scores,
        };
        next[coupleId] = {
          ...row,
          dances: existing ? row.dances.map((d) => (d.key === existing.key ? teamRow : d)) : [...row.dances, teamRow],
        };
      }
      return next;
    });
  }

  // Inferred fallback (migration not applied): the marks go into each
  // eligible member's existing team row here and ride the ordinary draft
  // save, so the entry works with no database change.
  async function handleApplyTeam(teamId: string, marks: TeamMark[]): Promise<ApplyOutcome> {
    if (!selectedEpisode) return { error: "Select a week first." };
    const view = teamViews.find((v) => v.team.id === teamId);
    if (!view) return { error: "That team is no longer on this episode. Refresh and try again." };
    const { team, plan } = view;
    setTeamBusy(true);
    try {
      const applied = plan.filter((p) => p.state === "will_apply" || p.state === "applied").map((p) => p.coupleId);
      writeTeamMarksIntoRows(team, marks, applied);
      for (const coupleId of applied) draftSaveQueue.current.markDirty(coupleId);
      const saved = await flushDraft();
      if (saved.error) return { error: saved.error };
      return {
        error: null,
        result: {
          applied,
          posted: plan.filter((p) => p.state === "posted_waiting").map((p) => p.coupleId),
          skipped: plan.filter((p) => p.state === "skipped").map((p) => ({ coupleId: p.coupleId, reason: p.reason ?? "withdrawn" })),
          collisions: plan.filter((p) => p.state === "collision").map((p) => ({ coupleId: p.coupleId, teamRows: 0, otherDances: p.otherDances })),
        },
      };
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    } finally {
      setTeamBusy(false);
    }
  }

  // Inferred fallback: un-post, carry the team score into the member's
  // draft, post again, through the existing reveal actions.
  async function handleOverrideTeamMember(teamId: string, coupleId: string, marks: TeamMark[]) {
    if (!selectedEpisode) return { error: "Select a week first." };
    const team = episodeTeams.find((t) => t.id === teamId);
    if (!team) return { error: "That team is no longer on this episode. Refresh and try again." };
    setTeamBusy(true);
    try {
      const undone = await undoCoupleReveal({ episodeId: selectedEpisode.id, coupleId });
      if (undone.error) return { error: `Could not un-post this couple: ${undone.error}` };
      writeTeamMarksIntoRows(team, marks, [coupleId]);
      draftSaveQueue.current.markDirty(coupleId);
      const saved = await flushDraft();
      if (saved.error) {
        router.refresh();
        return { error: `Un-posted, but the team score could not be saved: ${saved.error}` };
      }
      const reposted = await revealCoupleScores({ episodeId: selectedEpisode.id, coupleId });
      router.refresh();
      if (reposted.error) return { error: `Team score saved, but this couple could not be posted again: ${reposted.error}` };
      return { error: null };
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    } finally {
      setTeamBusy(false);
    }
  }

  // Entity model: marks live on the team and save as they are typed; the
  // team posts, un-posts or re-posts on its own and the week's judges points
  // are recomputed each time.
  async function handleSaveTeamMarks(teamId: string, marks: TeamMark[], markMax?: number) {
    if (!selectedEpisode) return { error: "Select a week first." };
    try {
      const result = await saveTeamMarksAction({ episodeId: selectedEpisode.id, teamId, marks, markMax });
      if (!result.error) {
        setDraftSavedAt(new Date().toISOString());
        setHasDraft(true);
      }
      return result;
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    }
  }

  async function handlePostTeam(teamId: string) {
    if (!selectedEpisode) return { error: "Select a week first." };
    setTeamBusy(true);
    try {
      const result = await revealTeamScores({ episodeId: selectedEpisode.id, teamId });
      if (!result.error) router.refresh();
      return result;
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleUndoTeam(teamId: string) {
    if (!selectedEpisode) return { error: "Select a week first." };
    setTeamBusy(true);
    try {
      const result = await undoTeamScores({ episodeId: selectedEpisode.id, teamId });
      if (!result.error) router.refresh();
      return result;
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    } finally {
      setTeamBusy(false);
    }
  }

  async function handleSaveSpecial(setup: SpecialDanceSetupInput) {
    if (!selectedEpisode) return { error: "Select a week first." };
    try {
      const result = await saveSpecialDanceAction({ episodeId: selectedEpisode.id, dance: setup });
      if (!result.error && result.result?.id) {
        setDraftSpecial(null);
        const value = teamPickValue(result.result.id);
        if (published) setPublishedSelectedId(value);
        else setByCoupleSelectedId(value);
        router.refresh();
      }
      return { error: result.error, id: result.result?.id };
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    }
  }

  async function handleDeleteSpecial(teamId: string) {
    if (!selectedEpisode) return { error: "Select a week first." };
    if (teamId === NEW_SPECIAL_ID) {
      setDraftSpecial(null);
      setByCoupleSelectedId(inProgressCouples[0]?.id ?? "");
      return { error: null };
    }
    try {
      const result = await deleteSpecialDanceAction({ episodeId: selectedEpisode.id, teamId });
      if (!result.error) {
        setDraftSpecial(null);
        router.refresh();
      }
      return result;
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    }
  }

  async function handleSaveSpecialPoints(teamId: string, scores: SpecialDanceScore[]) {
    if (!selectedEpisode) return { error: "Select a week first." };
    try {
      const result = await saveSpecialDancePointsAction({ episodeId: selectedEpisode.id, teamId, scores });
      if (!result.error) {
        setDraftSavedAt(new Date().toISOString());
        setHasDraft(true);
      }
      return result;
    } catch {
      return { error: "Could not confirm the update. Please refresh and try again." };
    }
  }

  function startAddSpecialDance() {
    if (!selectedEpisode) return;
    const draft = blankSpecialDance(selectedEpisode.id, freestyleStyleId);
    setDraftSpecial(draft);
    setShowLeaderboard(false);
    setCoupleViewMode("inProgress");
    setByCoupleSelectedId(ADD_SPECIAL_VALUE);
  }

  async function handlePublishCouple(coupleId: string, opts: { force?: boolean } = {}) {
    try {
      if (!selectedEpisode) return;
      // Posting a team member before their team is scored means the team
      // score can only reach them through an un-post. Ask first (frame 07).
      const team = teamByCouple.get(coupleId);
      if (!entity && team && !opts.force && !teamMarksComplete((rows[coupleId]?.dances ?? []).find((d) => isTeamDanceRow(team, d)) ?? null)) {
        setConfirmPublishTeamMember(coupleId);
        return;
      }
      setError(null);
      setRevealBusy(true);
      // Flush first so the server reads exactly what's on screen.
      const saveResult = await flushDraft();
      if (saveResult.error) {
        setRevealBusy(false);
        return;
      }
      const result = await revealCoupleScores({ episodeId: selectedEpisode.id, coupleId });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setRevealBusy(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setRevealBusy(false);
    }
  }

  async function handleUndoReveal(coupleId: string) {
    try {
      if (!selectedEpisode) return;
      setError(null);
      setRevealBusy(true);
      const result = await undoCoupleReveal({ episodeId: selectedEpisode.id, coupleId });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setRevealBusy(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setRevealBusy(false);
    }
  }

  function handleFinishWeek() {
    if (selectedWeek?.is_elimination_week && eliminatedCount < requiredEliminations) {
      setConfirmNoElimination(true);
      return;
    }
    void handlePublish();
  }

  async function handleReleaseDraftCouple(coupleId: string) {
    try {
      if (!selectedEpisode) return;
      setError(null);
      setReleasing(true);
      // Flush first so the release reads exactly what's on screen for this couple.
      const saveResult = await flushDraft();
      if (saveResult.error) {
        setReleasing(false);
        return;
      }
      const result = await releaseDraftCoupleAction(selectedEpisode.id, coupleId);
      if (result.error) {
        setError(result.error);
      } else {
        setReleasedCoupleIds((prev) => new Set(prev).add(coupleId));
        router.refresh();
      }
      setReleasing(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setReleasing(false);
    }
  }

  async function handleWithdrawDraftCouple(coupleId: string) {
    try {
      if (!selectedEpisode) return;
      setError(null);
      setReleasing(true);
      const result = await withdrawDraftCoupleAction(selectedEpisode.id, coupleId);
      if (result.error) {
        setError(result.error);
      } else {
        setReleasedCoupleIds((prev) => {
          const next = new Set(prev);
          next.delete(coupleId);
          return next;
        });
        router.refresh();
      }
      setReleasing(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setReleasing(false);
    }
  }

  async function handlePublish() {
    try {
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
        setReleasedCoupleIds(new Set());
        setJustPublished(true);
        router.refresh();
      }
      setPublishing(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setPublishing(false);
    }
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
    const queue = draftSaveQueue.current;
    let navigating = false;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.dirtyIds().length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const followLink = async (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (queue.dirtyIds().length === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (navigating) return;
      navigating = true;
      try {
        const result = await flushDraftRef.current();
        if (!result.error) router.push(url.pathname + url.search + url.hash);
      } finally {
        navigating = false;
      }
    };
    const onClick = (event: MouseEvent) => { void followLink(event); };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // Internal links await the save above. Other unmounts still attempt to
      // drain edits; abrupt browser termination cannot guarantee delivery.
      if (queue.dirtyIds().length > 0) void flushDraftRef.current();
    };
  }, [router]);

  function updateRow(coupleId: string, patch: Partial<CoupleRow>) {
    setRows((prev) => ({ ...prev, [coupleId]: { ...(prev[coupleId] ?? emptyRow()), ...patch } }));
    draftSaveQueue.current.markDirty(coupleId);
    scheduleAutosave();
  }

  function setStatus(coupleId: string, value: StatusValue) {
    updateRow(coupleId, {
      outcome: value,
      ...(value === "eliminated" ? { inJeopardy: false } : {}),
    });
  }

  function updateDance(coupleId: string, danceKey: string, patch: Partial<RowDance>) {
    const row = rows[coupleId] ?? emptyRow();
    updateRow(coupleId, {
      dances: row.dances.map((d) => (d.key === danceKey ? { ...d, ...patch } : d)),
    });
  }

  // Clears the slot rather than deleting it -- there's no "+ Dance" to add
  // one back, so dropping a couple to zero rows would strand them with no
  // way to re-enter a score short of reloading the page. A blank slot (no
  // danceStyleId) is already excluded from what buildDraftInput sends.
  function clearDance(coupleId: string, danceKey: string) {
    const row = rows[coupleId] ?? emptyRow();
    updateRow(coupleId, {
      dances: row.dances.map((d) => (d.key === danceKey ? { ...d, danceStyleId: "", songTitle: "", scores: {} } : d)),
    });
  }

  async function handleAddCustomMoment() {
    try {
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
          { id: result.id!, coupleId: customMomentCoupleId || null, label: customMomentLabel.trim() },
        ]);
        setCustomMomentLabel("");
        setCustomMomentCoupleId("");
      }
      setAddingCustomMoment(false);
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {
      setAddingCustomMoment(false);
    }
  }

  async function handleRemoveCustomMoment(momentId: string) {
    try {
      const result = await removeEpisodeCustomMoment(selectedEpisode!.id, momentId);
      if (result.error) setError(result.error);
      else setCustomMoments((prev) => prev.filter((m) => m.id !== momentId));
    } catch {
      setError("Could not confirm the update. Please refresh and try again.");
    } finally {

    }
  }

  const judgeDisplayNames = buildPeopleDisplayNames(judges);
  function judgesForDance(dance: RowDance) {
    const scoredIds = Object.entries(dance.scores)
      .filter(([, v]) => v.trim() !== "")
      .map(([id]) => id);
    return judgesForScoreInputs(judges, scoredIds, guestJudgesByEpisode[selectedEpisodeId] ?? []);
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

  // What the Team Dances card shows per member, from the same rows the couple
  // cards edit, so "Applies to N of M" and the couple cards never disagree.
  const nightJudgeIds = nightJudges.map((j) => j.id);
  const teamViews: TeamEntryView[] = episodeTeams.map((team) => {
    const plan = teamApplyPlan(
      team,
      team.memberCoupleIds.map((coupleId) => {
        const row = rows[coupleId] ?? emptyRow();
        const couple = couplesById.get(coupleId);
        return {
          coupleId,
          status: couple?.status ?? "active",
          eliminationWeek: couple?.elimination_week ?? null,
          outcome: row.outcome,
          dances: row.dances.map((d) => ({ danceStyleId: d.danceStyleId, songTitle: d.songTitle, scores: d.scores })),
          posted: revealedCoupleIds.has(coupleId),
          liveDances: revealedDancesByEpisode[selectedEpisode?.id ?? ""]?.[coupleId] ?? [],
        };
      }),
      {
        weekNumber: selectedWeek?.week_number ?? null,
        participantIds: participantsByEpisode[selectedEpisode?.id ?? ""] ?? [],
        judgeIds: nightJudgeIds,
      }
    );
    return {
      team,
      styleName: danceStyleItems[team.danceStyleId] ?? "Freestyle",
      plan,
      applied: appliedTeamMarks(plan),
      individualTotals: Object.fromEntries(
        team.memberCoupleIds.map((coupleId) => [
          coupleId,
          (rows[coupleId] ?? emptyRow()).dances.filter((d) => !isTeamDanceRow(team, d)).reduce((sum, d) => sum + danceTotal(d), 0),
        ])
      ),
    };
  });
  // Entity model: the team's marks live on the team, eligibility comes from
  // the same rules the RPCs use, and "posted" is the team's own state.
  const teamEntityViews: SpecialDanceView[] = entity
    ? [...persistedTeams, ...(draftSpecial ? [draftSpecial] : [])].map((dance) => {
        const { eligible, skipped } = eligibleTeamMembers(
          dance,
          dance.memberCoupleIds.map((coupleId) => {
            const couple = couplesById.get(coupleId);
            return {
              coupleId,
              status: couple?.status ?? "active",
              eliminationWeek: couple?.elimination_week ?? null,
              outcome: (rows[coupleId] ?? emptyRow()).outcome,
            };
          }),
          { weekNumber: selectedWeek?.week_number ?? null, participantIds: participantsByEpisode[selectedEpisode?.id ?? ""] ?? [] }
        );
        const panel = specialDancePanel(dance, nightJudgeIds);
        const saved = teamMarksByTeam[dance.id] ?? [];
        return {
          dance,
          styleName: danceStyleItems[dance.danceStyleId] ?? "Freestyle",
          secondStyleName: dance.secondDanceStyleId ? (danceStyleItems[dance.secondDanceStyleId] ?? null) : null,
          marks: panel.flatMap((id) => saved.filter((m) => m.judgeId === id)),
          scores: teamScoresByTeam[dance.id] ?? [],
          eligible,
          skipped,
          live: dance.postedAt ? (teamLiveByTeam[dance.id] ?? { total: 0, coupleIds: [], totalByCouple: {} }) : null,
        };
      })
    : [];
  const specialDancesByCouple = new Map<string, SpecialDanceView[]>();
  for (const view of teamEntityViews) {
    if (view.dance.id === NEW_SPECIAL_ID) continue;
    for (const coupleId of view.dance.memberCoupleIds) {
      (specialDancesByCouple.get(coupleId) ?? specialDancesByCouple.set(coupleId, []).get(coupleId)!).push(view);
    }
  }
  // A special dance with participants that is not fully scored blocks Finish
  // Week (the RPC refuses too); the button says which.
  const unscoredTeams = teamEntityViews.filter(
    (v) =>
      v.dance.id !== NEW_SPECIAL_ID &&
      v.dance.memberCoupleIds.length > 0 &&
      !specialDanceComplete(v.dance, {
        marks: v.marks,
        scores: v.scores,
        eligibleCoupleIds: v.eligible,
        nightJudgeIds,
      })
  );
  const nightSummary = buildNightSummary(
    scoredCouples.map((c) => {
      const team = teamByCouple.get(c.id);
      const specials = specialDancesByCouple.get(c.id) ?? [];
      const own: NightSummaryDance[] = (rows[c.id] ?? emptyRow()).dances
        .filter((d) => d.danceStyleId)
        .flatMap((d): NightSummaryDance[] => {
          if (!entity && team && isTeamDanceRow(team, d)) {
            const marks = Object.values(d.scores).filter((v) => v.trim() !== "").map(Number).filter(Number.isFinite);
            return marks.length > 0 ? [{ marks, label: team.name }] : [];
          }
          return [
            {
              marks: Object.values(d.scores).filter((v) => v.trim() !== "").map(Number).filter(Number.isFinite),
              label: null,
            },
          ];
        });
      const extra: NightSummaryDance[] = specials.flatMap((view): NightSummaryDance[] => {
        if (!view.eligible.includes(c.id)) return [];
        if (view.dance.scoringMode === "points") {
          const points = view.scores.find((s) => s.coupleId === c.id)?.points;
          return points != null ? [{ marks: [], points, label: view.dance.danceType || view.dance.name }] : [];
        }
        const panel = specialDancePanel(view.dance, nightJudgeIds);
        if (view.marks.length !== panel.length) return [];
        return [{ marks: view.marks.map((m) => m.score), markMax: view.dance.markMax, label: view.dance.danceType === "Team Dance" ? view.dance.name : view.dance.danceType }];
      });
      return { coupleId: c.id, dances: [...own, ...extra] };
    })
  );
  const nightTagLabel = { top: "Top Scorer", within1: "Within 1", within2: "Within 2" } as const;

  // A member's team dance is read-only on their own card (frames 06/08): the
  // marks come from the Team Dances card, so one member can't drift from the
  // rest of the team. Before the team is scored the row shows as waiting.
  function teamMarksComplete(dance: RowDance | null): boolean {
    return !!dance && nightJudgeIds.every((id) => (dance.scores[id] ?? "").trim() !== "");
  }

  // Entity model: the member's team dance is the team's own score, shown on
  // their card as a read-only line with the night it makes.
  function renderTeamEntityLine(views: SpecialDanceView[], row: CoupleRow, coupleId: string) {
    const ownMarks = row.dances.flatMap((d) => (d.danceStyleId ? [Object.values(d.scores).filter((v) => v.trim() !== "").map(Number).filter(Number.isFinite)] : []));
    const individual = ownMarks.reduce((sum, marks) => sum + marks.reduce((a, b) => a + b, 0), 0);
    const summary = nightSummary.find((r) => r.coupleId === coupleId);
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        {views.map((view) => {
          const { dance } = view;
          const skip = view.skipped.find((s) => s.coupleId === coupleId);
          const panel = specialDancePanel(dance, nightJudgeIds);
          const complete = dance.scoringMode === "points"
            ? view.scores.some((s) => s.coupleId === coupleId && s.points != null)
            : view.marks.length === panel.length;
          const total =
            dance.scoringMode === "points"
              ? (view.scores.find((s) => s.coupleId === coupleId)?.points ?? null)
              : complete
                ? teamMarksTotal(view.marks)
                : null;
          const carries = view.live?.coupleIds.includes(coupleId) ?? false;
          return (
            <div key={dance.id} className="flex flex-col gap-1 rounded-lg border border-dashed border-accent/40 bg-muted/30 p-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="font-medium">
                  {dance.danceType}
                  {dance.nameIsAuto || dance.danceType === dance.name ? "" : ` · ${dance.name}`}
                </span>
                <button type="button" className="font-semibold text-accent" onClick={() => openTeamEntry(dance.id)}>
                  Open →
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="font-heading">
                  {skip ? (
                    <span className="text-amber-text">
                      Skipped · {skip.reason === "bye" ? "Did Not Dance" : skip.reason === "withdrawn" ? "Withdrawn" : skip.reason === "eliminated" ? "Eliminated" : "Not Performing"}
                    </span>
                  ) : total != null ? (
                    dance.scoringMode === "points" ? (
                      <span className="font-semibold">{total > 0 ? `+${total}` : total}</span>
                    ) : (
                      <>
                        <span className="font-semibold">{total}</span>
                        <span className="text-muted-foreground">/{panel.length * dance.markMax}</span>
                      </>
                    )
                  ) : (
                    <span className="text-amber-text">Pending</span>
                  )}
                </span>
                <span className={carries ? "text-emerald-text" : "text-muted-foreground"}>
                  {view.styleName}
                  {dance.songTitle ? ` · ${dance.songTitle}` : ""}
                  {skip ? "" : carries ? " · Posted" : " · Not posted yet"}
                </span>
              </div>
            </div>
          );
        })}
        {summary && (
          <p className="text-xs text-muted-foreground">
            Individual {individual}
            {summary.parts.map((part) => ` + ${part.label} ${part.total}`).join("")}
            {summary.parts.length > 0 ? (
              <>
                {" "}= Night {summary.nightTotal}
                {summary.bonusTotal !== 0 ? ` · ${summary.marksTotal}/${summary.maxPossible}` : `/${summary.maxPossible}`}
                {" "}→ Dance Card <span className="font-heading text-accent">{formatPoints(summary.danceCardPreview)}</span>
              </>
            ) : null}
          </p>
        )}
      </div>
    );
  }

  // "Individual 28 + Team 36 = Night 64/80 → Dance Card 24.00 of 30", with
  // the team half Pending until all marks are in. Inferred fallback only.
  function renderNightLine(team: SpecialDance, row: CoupleRow, coupleId: string) {
    const teamRow = row.dances.find((d) => isTeamDanceRow(team, d)) ?? null;
    const individual = row.dances.filter((d) => d.danceStyleId && d !== teamRow).reduce((sum, d) => sum + danceTotal(d), 0);
    const complete = teamMarksComplete(teamRow);
    const night = complete ? nightPreview(row, coupleId) : null;
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        Individual {individual} + Team {complete && teamRow ? danceTotal(teamRow) : <span className="text-amber-text">Pending</span>}
        {night ? (
          <>
            {" "}= Night {night.split(" → ")[0]}
            {night.includes(" → ") ? <> → Dance Card <span className="font-heading text-accent">{night.split(" → ")[1]}</span> of 30</> : null}
          </>
        ) : null}
      </p>
    );
  }

  function renderTeamDanceRow(team: SpecialDance, dance: RowDance | null) {
    const max = nightJudgeIds.length * 10;
    return (
      <div
        key={dance?.key ?? `team-wait-${team.id}`}
        className="flex flex-col gap-1 rounded-lg border border-dashed border-accent/40 bg-muted/30 p-1.5 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <span className="font-medium">Dance 2 · Team Dance · {team.name}</span>
          <button type="button" className="font-semibold text-accent" onClick={() => openTeamEntry(team.id)}>
            Open team →
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <span className="font-heading">
            <span className="mr-2">{nightJudgeIds.map((id) => dance?.scores[id]?.trim() || "_").join(" · ")}</span>
            <span className="font-semibold">{dance ? danceTotal(dance) : 0}</span>
            <span className="text-muted-foreground">/{max}</span>
          </span>
          <span className={teamMarksComplete(dance) ? "text-emerald-text" : "text-amber-text"}>
            {danceStyleItems[team.danceStyleId] ?? "Freestyle"}
            {team.songTitle ? ` · ${team.songTitle}` : ""}
            {teamMarksComplete(dance) ? " · From the team entry" : " · Pending"}
          </span>
        </div>
      </div>
    );
  }

  // Called as a plain function, not rendered as <Component/>: a component
  // declared inside this one gets a new identity every render, which would
  // remount its inputs on every keystroke and drop focus.
  // Specials sit in the same picker as the couples (after them), A–Z by name,
  // members on one line. They are an entry-screen device only: nothing about
  // them is a couple to scoring, standings or fans.
  type PickerTeam = { dance: SpecialDance; view?: SpecialDanceView; inferredView?: TeamEntryView; render: () => ReactNode };
  function firstName(coupleId: string) {
    return coupleParts(namedCouple(coupleId) ?? { id: coupleId, celebrity_name: "?", pro_name: "?" }).celebrity;
  }
  function renderCouplePicker(list: Couple[], selectedId: string, onSelect: (id: string) => void, teams: PickerTeam[] = [], opts: { allowAdd?: boolean } = {}) {
    const allowAdd = Boolean(opts.allowAdd && special && canPublish);
    const listedTeams = [...teams.filter((t) => t.dance.id !== NEW_SPECIAL_ID)].sort((a, b) => {
      const byName = (a.dance.name || "").localeCompare(b.dance.name || "", undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : teams.indexOf(a) - teams.indexOf(b);
    });
    const selectedTeam = selectedId === ADD_SPECIAL_VALUE
      ? teams.find((v) => v.dance.id === NEW_SPECIAL_ID)
      : selectedId.startsWith("team:")
        ? teams.find((v) => teamPickValue(v.dance.id) === selectedId)
        : undefined;
    const current = selectedTeam ? null : (list.find((c) => c.id === selectedId) ?? list[0] ?? null);
    const value = selectedId === ADD_SPECIAL_VALUE
      ? ADD_SPECIAL_VALUE
      : selectedTeam
        ? teamPickValue(selectedTeam.dance.id)
        : (current?.id ?? (allowAdd ? ADD_SPECIAL_VALUE : teamPickValue(listedTeams[0]?.dance.id ?? "")));
    const teamLabel = (item: PickerTeam) => {
      const members = oxfordJoin(item.dance.memberCoupleIds.map(firstName));
      const status = item.view
        ? item.dance.postedAt
          ? "Posted"
          : null
        : item.dance.postedAt
          ? "Posted"
          : "Team Dance";
      return (
        <span className="flex flex-col">
          <span className="flex flex-wrap items-center gap-1.5">
            <strong>{item.dance.name || "New Special Dance"}</strong>
            {item.dance.danceType && <Badge variant="secondary">{item.dance.danceType}</Badge>}
            {status && <span className="text-muted-foreground">{status}</span>}
          </span>
          {members ? <span className="text-xs text-muted-foreground">{members}</span> : null}
        </span>
      );
    };
    const items: Record<string, ReactNode> = {
      ...Object.fromEntries(listedTeams.map((v) => [teamPickValue(v.dance.id), teamLabel(v)])),
      ...Object.fromEntries(list.map((c) => [c.id, coupleNameNode(coupleParts(c))])),
    };
    if (allowAdd) items[ADD_SPECIAL_VALUE] = "+ Add Special Dance";
    return (
      <>
        <Select
          items={items}
          value={value}
          onValueChange={(v) => {
            if (!v) return;
            if (v === ADD_SPECIAL_VALUE) {
              startAddSpecialDance();
              return;
            }
            onSelect(v);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {list.length > 0 && (
              <SelectGroup>
                <SelectLabel>Couples · {list.length}</SelectLabel>
                {list.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {coupleNameNode(coupleParts(c))}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {(listedTeams.length > 0 || allowAdd) && (
              <SelectGroup>
                <SelectLabel>Special Dances · {listedTeams.length}</SelectLabel>
                {listedTeams.map((v) => (
                  <SelectItem key={v.dance.id} value={teamPickValue(v.dance.id)}>
                    {teamLabel(v)}
                  </SelectItem>
                ))}
                {allowAdd && <SelectItem value={ADD_SPECIAL_VALUE}>+ Add Special Dance</SelectItem>}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {selectedTeam
          ? selectedTeam.render()
          : current
            ? renderDanceEntry(current)
            : teams[0]
              ? teams[0].render()
              : null}
      </>
    );
  }

  function openTeamEntry(teamId: string) {
    setShowLeaderboard(false);
    const value = teamPickValue(teamId);
    const postedDance = persistedTeams.find((t) => t.id === teamId)?.postedAt != null;
    if (published || postedDance) {
      setCoupleViewMode("published");
      setPublishedSelectedId(value);
    } else {
      setCoupleViewMode("inProgress");
      setByCoupleSelectedId(value);
    }
  }

  function specialParticipants(): { id: string; celebrity: string; pro: string; status: string; eliminationWeek: number | null }[] {
    return allCouplesWithStatus.map((c) => {
      const parts = coupleParts(c);
      return { id: c.id, celebrity: parts.celebrity, pro: parts.pro, status: c.status, eliminationWeek: c.elimination_week };
    });
  }

  function renderTeamEntityEntry(view: SpecialDanceView) {
    const others = teamEntityViews.filter((v) => v.dance.id !== view.dance.id).map((v) => v.dance);
    const usedTypes = persistedTeams.map((t) => ({ value: t.danceType, updatedAt: t.updatedAt }));
    const usedLabels = persistedTeams.flatMap((t) => t.details.map((d) => ({ value: d.label, updatedAt: t.updatedAt })));
    return (
      <SpecialDanceEntry
        key={view.dance.id}
        view={view}
        specialMode={special}
        judges={nightJudges}
        judgeNames={judgeDisplayNames}
        guestJudgeIds={new Set(guestJudgesByEpisode[selectedEpisode?.id ?? ""] ?? [])}
        nightJudgeIds={nightJudgeIds}
        danceStyles={danceStyles}
        participants={specialParticipants()}
        otherDances={others}
        recentDanceTypes={recentSuggestions(DANCE_TYPE_SUGGESTIONS, usedTypes)}
        recentDetailLabels={recentSuggestions(DETAIL_LABEL_SUGGESTIONS, usedLabels)}
        coupleName={(coupleId) => {
          const couple = namedCouple(coupleId);
          return couple ? <CoupleName {...coupleParts(couple)} /> : "This couple";
        }}
        canPost={canPublish && !published}
        canSetup={canPublish}
        inputsDisabled={published && !canPublish}
        busy={teamBusy || savingDraft || revealBusy || publishing || releasing}
        nowMs={nowMs}
        startInEdit={view.dance.id === NEW_SPECIAL_ID}
        onSaveSetup={handleSaveSpecial}
        onDelete={handleDeleteSpecial}
        onSaveMarks={handleSaveTeamMarks}
        onSavePoints={handleSaveSpecialPoints}
        onPost={handlePostTeam}
        onUndo={handleUndoTeam}
      />
    );
  }

  const pickerTeams: PickerTeam[] = entity
    ? teamEntityViews.map((view) => ({ dance: view.dance, view, render: () => renderTeamEntityEntry(view) }))
    : teamViews.map((view) => ({ dance: view.team, inferredView: view, render: () => renderTeamEntry(view) }));
  const openPickerTeams = pickerTeams.filter((v) => !v.dance.postedAt);
  const postedPickerTeams = pickerTeams.filter((v) => v.dance.postedAt);

  function renderTeamEntry(view: TeamEntryView) {
    return (
      <TeamEntry
        key={view.team.id}
        view={view}
        judges={nightJudges}
        judgeNames={judgeDisplayNames}
        guestJudgeIds={new Set(guestJudgesByEpisode[selectedEpisode?.id ?? ""] ?? [])}
        coupleName={(coupleId) => {
          const couple = namedCouple(coupleId);
          return couple ? <CoupleName {...coupleParts(couple)} /> : "This couple";
        }}
        canOverride={canPublish && !published}
        canSetup={false}
        inputsDisabled={published && !canPublish}
        busy={teamBusy || savingDraft || revealBusy || publishing || releasing}
        onApply={handleApplyTeam}
        onOverride={handleOverrideTeamMember}
      />
    );
  }

  function renderDanceEntry(c: Couple, rank?: number) {
    const row = rows[c.id] ?? emptyRow();
    const revealState = publishPerCouple ? revealStates.get(c.id) : undefined;
    // Once officially published, every couple's draft is already fully
    // editable underneath (see the correction-seed effect) -- this just
    // narrows which one the UI lets you touch, read-only by default.
    const correctionLocked = published && (!canPublish || !unlockedForCorrectionCoupleIds.has(c.id));
    const locked = published ? correctionLocked : revealState === "posted";
    const team = teamByCouple.get(c.id);
    const postedAtIso = revealedAtByCouple[c.id];
    const undoLeft = nowMs !== null && postedAtIso ? undoSecondsLeft(postedAtIso, nowMs) : 0;
    const publishBlocker = row.dances.filter((d) => d.danceStyleId).length === 0
      ? "Pick a dance style to publish."
      : revealState === "waiting"
        ? "Enter every dance's judge scores to publish."
        : null;
    return (
      <div key={c.id} className="rounded-xl border border-border p-2.5">
        <p className="text-sm font-semibold">
          {rank != null && <span className="text-muted-foreground">#{rank}</span>} <CoupleName {...coupleParts(c)} />
          {rank != null && (
            <span className="ml-1.5 text-muted-foreground">· {nightPreview(row, c.id) ?? `${coupleTotal(row)} pts`}</span>
          )}
        </p>

        <fieldset disabled={locked || revealBusy || publishing || releasing} className="mt-1.5 flex min-w-0 flex-col gap-1.5">
          {row.dances.map((d) => !entity && team && isTeamDanceRow(team, d) ? renderTeamDanceRow(team, d) : (
            <div key={d.key} className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-1.5">
              <div className="flex flex-wrap items-end gap-1.5">
                <Select
                  items={danceStyleItems}
                  value={d.danceStyleId}
                  onValueChange={(v) => updateDance(c.id, d.key, { danceStyleId: v ?? "" })}
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
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
                  className="h-8 min-w-32 flex-1 text-xs"
                  placeholder="Song title"
                  value={d.songTitle}
                  onChange={(e) => updateDance(c.id, d.key, { songTitle: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-end gap-1.5">
                {judgesForDance(d).map((j) => (
                  <div key={j.id} className="flex flex-col gap-0.5">
                    <Label className="text-[10px] text-muted-foreground">{judgeDisplayNames.get(j.id) ?? j.name}</Label>
                    <Input
                      className="h-8 w-12 px-1.5 text-center text-xs"
                      placeholder="—"
                      value={d.scores[j.id] ?? ""}
                      onChange={(e) => updateDance(c.id, d.key, { scores: { ...d.scores, [j.id]: e.target.value } })}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">Total</Label>
                  <p className="flex h-8 items-center px-1 text-sm font-medium">{danceTotal(d)}</p>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-danger-text"
                  onClick={() => clearDance(c.id, d.key)}
                >
                  Clear
                </Button>
              </div>
            </div>
          ))}
          {!entity && team && row.outcome !== "bye" && !row.dances.some((d) => isTeamDanceRow(team, d)) && renderTeamDanceRow(team, null)}
        </fieldset>
        {!entity && team && row.outcome !== "bye" && renderNightLine(team, row, c.id)}
        {entity && (specialDancesByCouple.get(c.id)?.length ?? 0) > 0 && row.outcome !== "bye" && renderTeamEntityLine(specialDancesByCouple.get(c.id)!, row, c.id)}

        {!published && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-2">
              {locked ? (
                <>
                  <Badge>Posted</Badge>
                  <Button
                    variant="ghost"
                    className="text-danger-text"
                    disabled={revealBusy}
                    onClick={() => void handleUndoReveal(c.id)}
                  >
                    {undoLeft > 0 ? `Undo · ${undoLeft}s` : "Un-Post"}
                  </Button>
                </>
              ) : (
                <>
                  {releasedCoupleIds.has(c.id) ? (
                    <>
                      <Badge>Drafted</Badge>
                      <Button
                        variant="ghost"
                        className="text-danger-text"
                        disabled={releasing}
                        onClick={() => void handleWithdrawDraftCouple(c.id)}
                      >
                        Withdraw
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={releasing || !row.dances.some((d) => Object.values(d.scores).some((v) => v !== ""))}
                      onClick={() => void handleReleaseDraftCouple(c.id)}
                    >
                      {releasing ? "Saving…" : "Save as Draft Score"}
                    </Button>
                  )}
                  {publishPerCouple && (
                    <Button
                      disabled={!!publishBlocker || savingDraft || revealBusy}
                      onClick={() => void handlePublishCouple(c.id)}
                    >
                      {revealBusy ? "Publishing…" : "Publish"}
                    </Button>
                  )}
                </>
              )}
            </div>
            {!locked && (
              <p className="text-[11px] text-muted-foreground">
                Draft stays on this couple until you publish. In progress → Drafted → Published.
              </p>
            )}
          </div>
        )}

        {published && canPublish && (
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            {correctionLocked ? (
              <Button
                variant="outline"
                onClick={() => setUnlockedForCorrectionCoupleIds((prev) => new Set(prev).add(c.id))}
              >
                Edit
              </Button>
            ) : (
              <>
                <Badge>Editing</Badge>
                <p className="text-[11px] text-muted-foreground">Changes apply on the next Publish Results.</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderOutcomeRow(c: Couple) {
    const row = rows[c.id] ?? emptyRow();
    return (
      <tr key={c.id} className="border-t border-border">
        <td className="sticky left-0 z-10 bg-card py-1 pr-2 font-medium">
          <CoupleName {...coupleParts(c)} />
        </td>
        <td className="px-1 py-1">
          <Select
            items={STATUS_LABELS}
            value={row.outcome}
            onValueChange={(v) => setStatus(c.id, (v as StatusValue) ?? "safe")}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
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
        </td>
        <td className="px-2 text-center">
          <input
            type="checkbox"
            aria-label="In Jeopardy"
            checked={row.inJeopardy}
            disabled={row.outcome === "eliminated"}
            onChange={(e) => updateRow(c.id, { inJeopardy: e.target.checked })}
          />
        </td>
        {judgesSaveAvailable && (
          <td className="px-2 text-center">
            <input
              type="checkbox"
              aria-label="Judges' Save used"
              checked={row.savedByJudges}
              onChange={(e) => updateRow(c.id, { savedByJudges: e.target.checked })}
            />
          </td>
        )}
        <td className="px-2 text-center">
          <input
            type="checkbox"
            aria-label="Immunity"
            checked={row.hadImmunity}
            onChange={(e) => updateRow(c.id, { hadImmunity: e.target.checked })}
          />
        </td>
                        <td className="px-1">
          <BonusDisclosure
            row={row}
            onChange={(patch) => updateRow(c.id, patch)}
            bonusRoundPoints={(specialDancesByCouple.get(c.id) ?? []).some((v) => v.dance.scoringMode === "points" && v.scores.some((s) => s.coupleId === c.id && s.points != null))}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
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

      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {postedSkipNotice.length > 0 && (
        <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-text">
          <p>
            {postedSkipNotice.map((coupleId, i) => {
              const couple = namedCouple(coupleId);
              return (
                <span key={coupleId}>
                  {i > 0 && (i === postedSkipNotice.length - 1 ? " and " : ", ")}
                  {couple ? <CoupleName {...coupleParts(couple)} /> : "A couple"}
                </span>
              );
            })}{" "}
            {postedSkipNotice.length === 1 ? "was" : "were"} posted before that edit saved, so their dance scores were
            reloaded from the saved draft. Everything else was saved.
          </p>
          <Button size="xs" variant="ghost" onClick={() => setPostedSkipNotice([])}>
            Dismiss
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Enter Results</CardTitle>
            {status && <Badge variant={RESULTS_STATUS_BADGE_VARIANT[status]}>{RESULTS_STATUS_BADGE_LABEL[status]}</Badge>}
          </div>
          {selectedEpisode && (
            <CardDescription>
              {seedingCorrection
                ? "Loading published results…"
                : savingDraft
                  ? "Saving draft…"
                  : draftSavedAt
                    ? `Draft saved ${draftSavedAgo}`
                    : "Not saved yet"}
              {!canPublish && !seedingCorrection && " · A site admin reviews and publishes it."}
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
              disabled={savingDraft || revealBusy || publishing || releasing}
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
          {selectedEpisode && !seedingCorrection && (
            <div className="mt-2 flex items-baseline gap-2 text-sm">
              <span className="text-xs text-muted-foreground">Air Date</span>
              <span>
                {new Date(selectedEpisode.airs_at).toLocaleDateString(undefined, {
                  month: "numeric",
                  day: "numeric",
                  year: "numeric",
                })}
                ,{" "}
                {new Date(selectedEpisode.airs_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEpisode && seedingCorrection && (
        <p className="text-sm text-muted-foreground">Loading this week&apos;s published results…</p>
      )}

      {selectedEpisode && !seedingCorrection && (
        <>
          {selectedEpisode.results_published_at &&
            selectedWeek &&
            selectedWeek.week_number !== mostRecentPublishedWeekNumber && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-text">
                <p className="font-medium">Correcting an earlier week</p>
                <p className="mt-0.5 text-amber-text/90">
                  {formatEpisodeCasual(mostRecentPublishedWeekNumber)} has already been published
                  after this week — correcting an elimination here won&apos;t recompute that later
                  week automatically. Double-check it still makes sense afterward.
                </p>
              </div>
            )}
          {selectedWeek?.is_double_elimination_week && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-text">
              <p className="font-medium">⚡ Double Elimination Week</p>
              <p className="mt-0.5 text-amber-text/90">
                Mark two couples Eliminated below — Curtain Call is collecting two guesses from
                managers this week.
              </p>
            </div>
          )}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Couples &amp; Scores</CardTitle>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    className="text-sm font-semibold text-accent"
                    onClick={() => setShowLeaderboard(true)}
                  >
                    Leaderboard →
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant={!showLeaderboard && coupleViewMode === "inProgress" ? "default" : "outline"}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setCoupleViewMode("inProgress");
                  }}
                >
                  In progress
                </Button>
                <Button
                  size="sm"
                  variant={!showLeaderboard && coupleViewMode === "drafted" ? "default" : "outline"}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setCoupleViewMode("drafted");
                  }}
                >
                  Drafted
                </Button>
                <Button
                  size="sm"
                  variant={!showLeaderboard && coupleViewMode === "published" ? "default" : "outline"}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setCoupleViewMode("published");
                  }}
                >
                  Published
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {showLeaderboard ? (
                scoredCouples.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scores entered yet.</p>
                ) : (
                  <>
                    {isTeamNight && nightSummary.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">Night Summary</p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Night · Dance Card</p>
                        </div>
                        <div className="flex flex-col rounded-lg border border-border">
                          {nightSummary.map((row, i) => {
                            const couple = namedCouple(row.coupleId);
                            return (
                              <div key={row.coupleId} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0">
                                <span className="w-5 shrink-0 font-rank text-sm text-muted-foreground">{i + 1}</span>
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                                    {couple ? <CoupleName {...coupleParts(couple)} /> : null}
                                    {row.tag && (
                                      <Badge variant={row.tag === "top" ? "default" : "outline"}>{nightTagLabel[row.tag]}</Badge>
                                    )}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    Individual {row.individualTotal}
                                    {row.parts.map((part) => ` + ${part.label} ${part.total}`).join("")}
                                  </span>
                                </div>
                                <div className="flex shrink-0 flex-col items-end">
                                  <span className="font-heading text-base font-semibold">
                                    {row.nightTotal}
                                    <span className="text-xs font-normal text-muted-foreground">/{row.maxPossible}</span>
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    <span className="font-heading text-accent">{formatPoints(row.danceCardPreview)}</span> of 30
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Top Scorer and Within 1/2 are Curtain Call&apos;s raw-total bands; Dance Card is the night on the
                          30-point basis, before the multiplier. Both are previews until Finish Week.
                        </p>
                      </div>
                    )}
                    {[...scoredCouples]
                      .sort((a, b) => coupleTotal(rows[b.id] ?? emptyRow()) - coupleTotal(rows[a.id] ?? emptyRow()))
                      .map((c, i) => renderDanceEntry(c, i + 1))}
                  </>
                )
              ) : coupleViewMode === "drafted" ? (
                draftedCouples.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {published ? "This episode is published — see Published." : "No couples drafted yet."}
                  </p>
                ) : (
                  renderCouplePicker(draftedCouples, draftedSelectedId, setDraftedSelectedId)
                )
              ) : coupleViewMode === "published" ? (
                publishedCouples.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No couples published yet.</p>
                ) : (
                  renderCouplePicker(publishedCouples, publishedSelectedId, setPublishedSelectedId, published ? pickerTeams : postedPickerTeams)
                )
              ) : inProgressCouples.length === 0 && (published || (openPickerTeams.length === 0 && !(special && canPublish))) ? (
                <p className="text-sm text-muted-foreground">
                  {episodeCouples.length === 0
                    ? "No couples to check for this episode."
                    : published
                      ? "This episode is published — see Published."
                      : "Every couple's scores are drafted or published."}
                </p>
              ) : (
                <>
                  {renderCouplePicker(inProgressCouples, byCoupleSelectedId, setByCoupleSelectedId, published ? [] : openPickerTeams, { allowAdd: !published && special && canPublish })}
                  {isTeamNight && pickerTeams.length === 0 && !special && (
                    <p className="text-xs text-muted-foreground">
                      No teams yet. Give each team&apos;s couples the same Freestyle and song in their second slot and the team appears here as its own entry.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <Accordion defaultValue={[]}>
              <AccordionItem value="finish-week">
                <AccordionTrigger className="px-(--card-spacing) pt-(--card-spacing) hover:no-underline">
                  <CardHeader className="flex-1 p-0">
                    <CardTitle>{published ? "Outcomes" : "Finish Week"}</CardTitle>
                    <CardDescription className="text-xs">
                      Mark eliminations and anything else that happened, then{" "}
                      {published ? "publish the correction" : "finish the week"}. Tick In Jeopardy for couples the
                      show called down who stayed. That list is what Curtain Call uses — it is not taken from the
                      scores.
                      {publishPerCouple && revealedCoupleIds.size > 0 && unpostedCount > 0
                        ? ` ${unpostedCount} ${unpostedCount === 1 ? "couple is" : "couples are"} still to publish.`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="flex flex-col gap-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="sticky left-0 z-10 bg-card py-1 pr-2 font-medium">Couple</th>
                            <th className="px-1 font-medium">Status</th>
                            <th className="px-2 text-center font-medium">In Jeopardy</th>
                            {judgesSaveAvailable && (
                              <th className="px-2 text-center font-medium">Judges&apos; Save</th>
                            )}
                            <th className="px-2 text-center font-medium">Immunity</th>
                            <th className="px-1 font-medium">Fantasy Bonus (pts)</th>
                          </tr>
                        </thead>
                        <tbody>{episodeCouples.map((c) => renderOutcomeRow(c))}</tbody>
                      </table>
                    </div>
                    {episodeCouples.some((c) => (rows[c.id] ?? emptyRow()).outcome === "bye") && (
                      <p className="text-xs text-muted-foreground">
                        Did Not Dance is for a couple still in the cast tonight who didn&apos;t perform (an
                        odd-couple bye, a mid-competition injury): they stay active and earn no survival bonus this
                        week. For a couple not appearing this broadcast at all, use &quot;Who&apos;s
                        Performing?&quot; under Edit Scheduled Episode.
                      </p>
                    )}
                    {publishPerCouple && (
                      <Button
                        className="self-start"
                        onClick={handleFinishWeek}
                        disabled={savingDraft || publishing || unpostedCount > 0 || unscoredTeams.length > 0}
                      >
                        {publishing ? "Finishing…" : "Finish Week"}
                      </Button>
                    )}
                    {publishPerCouple && unscoredTeams.length > 0 && (
                      <p className="text-xs text-amber-text">
                        {oxfordJoin(unscoredTeams.map((v) => v.dance.name))} {unscoredTeams.length === 1 ? "is" : "are"} not fully
                        scored. Score {unscoredTeams.length === 1 ? "it" : "them"} or remove {unscoredTeams.length === 1 ? "it" : "them"} before finishing the week.
                      </p>
                    )}
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          <Dialog open={confirmPublishTeamMember != null} onOpenChange={(open) => !open && setConfirmPublishTeamMember(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Wait for the Team Dance?</DialogTitle>
                <DialogDescription>
                  {(() => {
                    const coupleId = confirmPublishTeamMember ?? "";
                    const team = teamByCouple.get(coupleId);
                    const couple = namedCouple(coupleId);
                    return (
                      <>
                        {team?.name ?? "Their team"} doesn&apos;t have all four team marks yet. If you publish{" "}
                        {couple ? <CoupleName {...coupleParts(couple)} /> : "this couple"} now, the team score can&apos;t
                        reach them until you un-post them. Waiting is safer.
                      </>
                    );
                  })()}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const coupleId = confirmPublishTeamMember;
                    setConfirmPublishTeamMember(null);
                    if (coupleId) void handlePublishCouple(coupleId, { force: true });
                  }}
                >
                  Publish Anyway
                </Button>
                <Button onClick={() => setConfirmPublishTeamMember(null)}>Wait for Team</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={confirmNoElimination} onOpenChange={setConfirmNoElimination}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm the Eliminations</DialogTitle>
                <DialogDescription>
                  {eliminatedCount === 0
                    ? "No elimination is marked for this week."
                    : `Only ${eliminatedCount} of ${requiredEliminations} eliminations are marked for this week.`}{" "}
                  Confirm that&apos;s right, or go back and mark them first. Finishing posts survival, Curtain Call
                  and Grand Finale points to every league.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmNoElimination(false)}>
                  Go Back
                </Button>
                <Button
                  onClick={() => {
                    setConfirmNoElimination(false);
                    void handlePublish();
                  }}
                >
                  Finish Week Anyway
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <Accordion defaultValue={[]}>
              <AccordionItem value="special-moments">
                <AccordionTrigger className="px-(--card-spacing) pt-(--card-spacing) hover:no-underline">
                  <CardHeader className="flex-1 p-0">
                    <CardTitle>Special Moments</CardTitle>
                    <CardDescription>Perfect scores and Judges&apos; Save are detected automatically.</CardDescription>
                  </CardHeader>
                </AccordionTrigger>
                <AccordionContent>
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
                      {perfectScorePills.length === 0 &&
                        judgesSavePills.length === 0 &&
                        customMoments.length === 0 && (
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
                          items={{
                            "": "—",
                            ...Object.fromEntries(episodeCouples.map((c) => [c.id, coupleNameNode(coupleParts(c))])),
                          }}
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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          {published && canPublish && (
            <div className={`fixed inset-x-0 z-30 ${BOTTOM_NAV_STACK_ABOVE}`}>
              <div className="mx-auto flex w-full max-w-(--frame-width) flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Publishing updates Results & Standings across every league immediately.
                </p>
                <div className="flex gap-2 sm:w-auto">
                  <Button className="flex-1 sm:flex-none" onClick={handlePublish} disabled={savingDraft || publishing || releasing}>
                    {publishing ? "Publishing…" : "Publish Results"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {eliminationOrder.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Season Elimination Order</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {/* Same row shape as Grand Finale's own order list minus the
                points pill — this is the real result, not a prediction.
                Displayed winner-first: "1." at the winner, counting up toward
                the first couple eliminated at the bottom (highest number).
                Numbers are season-wide positions (allCouplesWithStatus.length,
                the full cast), not eliminationOrder.length — mid-season,
                eliminationOrder only holds couples with a resolved fate so
                far, so using its own length would understate every number
                until the finale. Elimination wording is "Week N"
                (formatEpisodeCasual), not Grand Finale's abbreviated
                "W2 Elim". */}
            {[...eliminationOrder].reverse().map((c, i) => (
              <div
                key={c.id}
                className="flex items-center justify-between border-b border-border py-1 text-sm last:border-b-0"
              >
                <span>
                  {allCouplesWithStatus.length - eliminationOrder.length + i + 1}.{" "}
                  <CoupleName {...(allCoupleDisplayNames[c.id] ?? { celebrity: c.celebrity_name, pro: c.pro_name })} />
                </span>
                <span className="text-muted-foreground">
                  {c.status === "winner"
                    ? "Won the season"
                    : c.status === "runner_up"
                      ? "Runner-up"
                      : c.status === "third_place"
                        ? "Third Place"
                        : formatEpisodeCasual(c.elimination_week!)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BonusDisclosure({
  row,
  onChange,
  bonusRoundPoints,
}: {
  row: CoupleRow;
  onChange: (patch: Partial<CoupleRow>) => void;
  bonusRoundPoints: boolean;
}) {
  const [open, setOpen] = useState(row.bonusPoints !== 0 || row.bonusNote !== "");

  if (!open) {
    return (
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        + Fantasy Bonus
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="h-7 w-14 text-xs"
          value={row.bonusPoints}
          onChange={(e) => onChange({ bonusPoints: Number(e.target.value) })}
        />
        <Input
          className="h-7 w-32 text-xs"
          placeholder="Fantasy points, not a dance-off"
          value={row.bonusNote}
          onChange={(e) => onChange({ bonusNote: e.target.value })}
        />
      </div>
      {bonusRoundPoints && (
        <p className="text-[10px] text-amber-text">This couple already has bonus-round points. A fantasy bonus pays in addition to those.</p>
      )}
    </div>
  );
}
