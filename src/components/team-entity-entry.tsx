"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ScoringJudge } from "@/lib/scoring-judges";
import { undoSecondsLeft } from "@/lib/reveal-state";
import {
  parseTeamMarks,
  teamMarksTotal,
  TEAM_DANCE_JUDGE_COUNT,
  TEAM_DANCE_MAX_PER_JUDGE,
  type EpisodeTeam,
  type SkipReason,
  type TeamMark,
} from "@/lib/team-dances";

export type TeamEntityView = {
  team: EpisodeTeam;
  styleName: string;
  // Marks saved on the team (draft until posted), in judge order.
  marks: TeamMark[];
  eligible: string[];
  skipped: { coupleId: string; reason: SkipReason }[];
  // Live team rows: total and who carries one, when the team is posted.
  live: { total: number; coupleIds: string[] } | null;
};

const SKIP_LABEL: Record<SkipReason, string> = {
  withdrawn: "Withdrawn · Skipped",
  bye: "Did Not Dance · Skipped",
  eliminated: "Eliminated · Skipped",
  not_performing: "Not Performing · Skipped",
};

function marksToInputs(marks: TeamMark[]): Record<string, string> {
  return Object.fromEntries(marks.map((m) => [m.judgeId, String(m.score)]));
}

function marksKey(marks: TeamMark[]): string {
  return marks.map((m) => `${m.judgeId}:${m.score}`).sort().join(",");
}

// One team as an entry in the couple picker: the same card shape as a
// couple, with the team's style and song read-only, four judge boxes saved
// on the team as they are typed, and its own Publish / Undo / Re-post. A
// member's own dance posts independently; the team's score reaches every
// eligible member only when the team is posted.
export function TeamEntityEntry({
  view,
  judges,
  judgeNames,
  guestJudgeIds,
  coupleName,
  canPost,
  canSetup,
  inputsDisabled,
  busy,
  nowMs,
  onSaveMarks,
  onPost,
  onUndo,
  onEditTeams,
}: {
  view: TeamEntityView;
  judges: ScoringJudge[];
  judgeNames: Map<string, string>;
  guestJudgeIds: ReadonlySet<string>;
  coupleName: (coupleId: string) => ReactNode;
  canPost: boolean;
  canSetup: boolean;
  inputsDisabled: boolean;
  busy: boolean;
  nowMs: number | null;
  onSaveMarks: (teamId: string, marks: TeamMark[]) => Promise<{ error: string | null }>;
  onPost: (teamId: string) => Promise<{ error: string | null }>;
  onUndo: (teamId: string) => Promise<{ error: string | null }>;
  onEditTeams: () => void;
}) {
  const { team, eligible, skipped, live } = view;
  const judgeIds = judges.map((j) => j.id);
  const [inputs, setInputs] = useState<Record<string, string>>(() => marksToInputs(view.marks));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved marks fill the boxes until the person types; a successful save
  // hands the boxes back to that sync.
  const savedKey = marksKey(view.marks);
  useEffect(() => {
    if (!dirty) setInputs(marksToInputs(view.marks));
  }, [savedKey, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = parseTeamMarks(inputs, judgeIds);
  const panelOk = judges.length === TEAM_DANCE_JUDGE_COUNT;
  // Whatever is validly typed, partial or complete, is what gets saved.
  const typedMarks: TeamMark[] = judgeIds.flatMap((id) => {
    const raw = (inputs[id] ?? "").trim();
    const n = Number(raw);
    return raw !== "" && Number.isFinite(n) && n >= 0 && n <= TEAM_DANCE_MAX_PER_JUDGE ? [{ judgeId: id, score: n }] : [];
  });
  const typedKey = marksKey(typedMarks);
  const attemptedKey = useRef(savedKey);
  const pendingSave = dirty && panelOk && parsed.invalidJudgeIds.length === 0 && typedKey !== savedKey && attemptedKey.current !== typedKey;

  useEffect(() => {
    if (!pendingSave || inputsDisabled) return;
    const marks = typedMarks;
    const timer = setTimeout(async () => {
      attemptedKey.current = typedKey;
      setSaving(true);
      setError(null);
      const outcome = await onSaveMarks(team.id, marks);
      setSaving(false);
      if (outcome.error) setError(outcome.error);
      else setDirty(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [typedKey, pendingSave, inputsDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedTotal = view.marks.length === TEAM_DANCE_JUDGE_COUNT ? teamMarksTotal(view.marks) : null;
  const typedTotal = teamMarksTotal(typedMarks);
  const complete = view.marks.length === TEAM_DANCE_JUDGE_COUNT && !dirty;
  const posted = team.postedAt != null;
  const stale = posted && live != null && savedTotal != null && live.total !== savedTotal;
  const undoLeft = nowMs !== null && team.postedAt ? undoSecondsLeft(team.postedAt, nowMs) : 0;
  const missingNames = judgeIds.filter((id) => (inputs[id] ?? "").trim() === "").map((id) => judgeNames.get(id) ?? "a judge");
  const guestNames = judges.filter((j) => guestJudgeIds.has(j.id)).map((j) => judgeNames.get(j.id) ?? j.name);

  let status: { tone: "muted" | "ok" | "danger" | "warn"; text: string } | null = null;
  if (parsed.invalidJudgeIds.length > 0) {
    const judgeId = parsed.invalidJudgeIds[0];
    status = { tone: "danger", text: `Judge scores must be between 0 and ${TEAM_DANCE_MAX_PER_JUDGE}. ${judgeNames.get(judgeId) ?? "That"}'s ${inputs[judgeId]?.trim()} isn't saved.` };
  } else if (parsed.filled < judgeIds.length) {
    status = {
      tone: parsed.filled === 0 ? "muted" : "warn",
      text:
        parsed.filled === 0
          ? `0 of ${judgeIds.length} judges in. Waiting for the team dance.`
          : `${parsed.filled} of ${judgeIds.length} judges in. The team can be posted once ${missingNames.join(" and ")}'s score is in; each couple's own dance posts on its own.`,
    };
  } else if (saving || pendingSave) {
    status = { tone: "muted", text: `All ${judgeIds.length} judges in. Saving…` };
  } else if (posted && stale) {
    status = { tone: "warn", text: `Saved ${savedTotal}/40, but ${live?.total}/40 is live. Re-post the team to update every member.` };
  } else if (posted) {
    status = { tone: "ok", text: `Posted. ${live?.coupleIds.length ?? eligible.length} ${(live?.coupleIds.length ?? eligible.length) === 1 ? "couple carries" : "couples carry"} the team dance live.` };
  } else if (complete) {
    status = { tone: "ok", text: `All ${judgeIds.length} judges in and saved. ${canPost ? "Publish the team to add it to every member's night." : "A site admin posts the team."}` };
  }

  return (
    <div className="rounded-xl border border-accent/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <strong>{team.name}</strong> <span className="font-normal text-muted-foreground">· Team Dance</span>
        </p>
        <div className="flex items-center gap-2">
          {posted && <Badge>Posted</Badge>}
          {canSetup && (
            <Button size="xs" variant="ghost" onClick={onEditTeams} disabled={busy}>
              Edit Teams
            </Button>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {team.memberCoupleIds.map((coupleId, i) => (
          <span key={coupleId}>
            {i > 0 && ", "}
            {coupleName(coupleId)}
            {team.captainCoupleId === coupleId && " (Captain)"}
          </span>
        ))}
        {team.hostName && ` · Host ${team.hostName} dances, not scored`}
      </p>

      {panelOk ? (
        <fieldset disabled={inputsDisabled || busy} className="mt-1.5 flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="secondary">{view.styleName}</Badge>
              <span className="text-muted-foreground">
                {team.songTitle ? `“${team.songTitle}”` : "No song yet"}
                {team.songSource ? ` · ${team.songSource}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-1.5">
              {judges.map((j) => (
                <div key={j.id} className="flex flex-col gap-0.5">
                  <Label className={`text-[10px] ${guestJudgeIds.has(j.id) ? "text-accent" : "text-muted-foreground"}`}>
                    {judgeNames.get(j.id) ?? j.name}
                  </Label>
                  <Input
                    inputMode="decimal"
                    aria-label={`${judgeNames.get(j.id) ?? j.name} mark for ${team.name}`}
                    className={`h-8 w-12 px-1.5 text-center text-xs ${parsed.invalidJudgeIds.includes(j.id) ? "border-destructive" : ""}`}
                    placeholder="—"
                    value={inputs[j.id] ?? ""}
                    onChange={(e) => {
                      setDirty(true);
                      setError(null);
                      setInputs((prev) => ({ ...prev, [j.id]: e.target.value }));
                    }}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-0.5">
                <Label className="text-[10px] text-muted-foreground">Team</Label>
                <p className="flex h-8 items-center px-1 text-sm font-medium">
                  {typedTotal}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">/{judgeIds.length * TEAM_DANCE_MAX_PER_JUDGE}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-muted-foreground">
              <span>0 to {TEAM_DANCE_MAX_PER_JUDGE} per judge · one score for the whole team</span>
              <span>
                {guestNames.length > 0 ? `${guestNames.join(" and ")} ${guestNames.length === 1 ? "is" : "are"} tonight's guest · ` : ""}
                {parsed.filled} of {judgeIds.length} in
              </span>
            </div>
          </div>
        </fieldset>
      ) : (
        <div role="alert" className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-text">
          Team Dances need exactly {TEAM_DANCE_JUDGE_COUNT} judges and this night has {judges.length}.{" "}
          <Link href="/admin/schedule" className="font-semibold underline underline-offset-2">
            Set the guest judge on Schedule
          </Link>{" "}
          before entering team marks.
        </div>
      )}

      {status && (
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

      <div className="mt-2 flex flex-col rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>
            Applies to {eligible.length} of {team.memberCoupleIds.length} couples
          </span>
          <span className="normal-case tracking-normal">Added to each night as its team dance</span>
        </div>
        {team.memberCoupleIds.map((coupleId) => {
          const skip = skipped.find((s) => s.coupleId === coupleId);
          const carries = live?.coupleIds.includes(coupleId) ?? false;
          const label = skip ? SKIP_LABEL[skip.reason] : carries ? (stale ? "Posted · Old Team Score" : "Posted") : posted ? "Will Post on Re-post" : "Will Post";
          const tone = skip ? "text-amber-text" : carries ? (stale ? "text-amber-text" : "text-emerald-text") : "text-muted-foreground";
          return (
            <div key={coupleId} className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-2.5 py-1 text-sm last:border-b-0">
              <span className="flex flex-wrap items-center gap-1.5">
                {coupleName(coupleId)}
                {team.captainCoupleId === coupleId && <Badge variant="outline">Captain</Badge>}
              </span>
              <span className={`shrink-0 text-xs ${tone}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {canPost && panelOk && (
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
                    const outcome = await onUndo(team.id);
                    setPosting(false);
                    if (outcome.error) setError(outcome.error);
                  }}
                >
                  {undoLeft > 0 ? `Undo · ${undoLeft}s` : "Un-Post Team"}
                </Button>
                {stale && (
                  <Button
                    disabled={busy || posting || !complete}
                    onClick={async () => {
                      setPosting(true);
                      setError(null);
                      const outcome = await onPost(team.id);
                      setPosting(false);
                      if (outcome.error) setError(outcome.error);
                    }}
                  >
                    {posting ? "Posting…" : "Re-post Team"}
                  </Button>
                )}
              </>
            ) : (
              <Button
                disabled={busy || posting || !complete || eligible.length === 0}
                onClick={async () => {
                  setPosting(true);
                  setError(null);
                  const outcome = await onPost(team.id);
                  setPosting(false);
                  if (outcome.error) setError(outcome.error);
                }}
              >
                {posting ? "Publishing…" : "Publish Team"}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {posted
              ? "The team's score is live for every eligible member. Each couple's own dance posts separately."
              : "Posts the team's score to every eligible member, whether or not their own dance is posted yet."}
          </p>
        </div>
      )}
    </div>
  );
}
