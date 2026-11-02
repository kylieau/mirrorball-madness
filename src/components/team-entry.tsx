"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ScoringJudge } from "@/lib/scoring-judges";
import {
  parseTeamMarks,
  sameTeamMarks,
  teamMarksTotal,
  TEAM_DANCE_JUDGE_COUNT,
  TEAM_DANCE_MAX_PER_JUDGE,
  type EpisodeTeam,
  type TeamMark,
  type TeamMemberPlan,
} from "@/lib/team-dances";

export type TeamEntryView = {
  team: EpisodeTeam;
  styleName: string;
  plan: TeamMemberPlan[];
  applied: { marks: TeamMark[] | null; mismatch: boolean };
  // Each member's own (non-team) marks so far, for the posted-member warning.
  individualTotals: Record<string, number>;
};

// What the inferred fallback's apply reports back to the entry.
export type ApplyTeamDanceResult = {
  applied: string[];
  posted: string[];
  skipped: { coupleId: string; reason: "withdrawn" | "bye" | "eliminated" | "not_performing" }[];
  collisions: { coupleId: string; teamRows: number; otherDances: number }[];
};

export type ApplyOutcome = { error: string | null; result?: ApplyTeamDanceResult };

const APPLIES_STATES = new Set<TeamMemberPlan["state"]>(["will_apply", "applied", "posted_applied"]);

function marksToInputs(marks: TeamMark[] | null): Record<string, string> {
  return Object.fromEntries((marks ?? []).map((m) => [m.judgeId, String(m.score)]));
}

function marksKey(marks: TeamMark[] | null): string {
  return (marks ?? []).map((m) => `${m.judgeId}:${m.score}`).sort().join(",");
}

type Tone = "muted" | "ok" | "danger" | "warn";

function memberStateLabel(plan: TeamMemberPlan): { label: string; tone: Tone } {
  switch (plan.state) {
    case "will_apply":
      return { label: "Will Apply", tone: "muted" };
    case "applied":
      return { label: "Applied", tone: "ok" };
    case "posted_applied":
      return { label: "Posted · Applied", tone: "ok" };
    case "posted_waiting":
      return { label: "Posted · Can't Apply", tone: "danger" };
    case "skipped":
      return {
        label:
          plan.reason === "bye"
            ? "Did Not Dance · Skipped"
            : plan.reason === "withdrawn"
              ? "Withdrawn · Skipped"
              : plan.reason === "eliminated"
                ? "Eliminated · Skipped"
                : "Not Performing · Skipped",
        tone: "warn",
      };
    case "collision":
      return {
        label: plan.otherDances === 0 ? "Needs Their Own Dance First" : `${plan.otherDances} Dances Already · Can't Apply`,
        tone: "warn",
      };
  }
}

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-muted-foreground",
  ok: "text-emerald-text",
  danger: "text-danger-text",
  warn: "text-amber-text",
};

// One team as an entry in the couple picker: the same card shape as a
// couple, with the team's style and song read-only, four judge boxes, and
// the live "Applies to N of M" member list. Nothing is written until every
// box holds a valid mark; the fourth valid mark saves the team dance into
// every eligible member's Dance 2 draft.
export function TeamEntry({
  view,
  judges,
  judgeNames,
  guestJudgeIds,
  coupleName,
  canOverride,
  canSetup,
  inputsDisabled,
  busy,
  onApply,
  onOverride,
  onEditTeams,
}: {
  view: TeamEntryView;
  judges: ScoringJudge[];
  judgeNames: Map<string, string>;
  guestJudgeIds: ReadonlySet<string>;
  coupleName: (coupleId: string) => ReactNode;
  canOverride: boolean;
  // An inferred team is edited by changing the couples' own second slots;
  // the entity model's saved teams use TeamEntityEntry instead.
  canSetup: boolean;
  inputsDisabled: boolean;
  busy: boolean;
  onApply: (teamId: string, marks: TeamMark[]) => Promise<ApplyOutcome>;
  onOverride: (teamId: string, coupleId: string, marks: TeamMark[]) => Promise<{ error: string | null }>;
  onEditTeams: () => void;
}) {
  const { team, plan, applied } = view;
  const judgeIds = judges.map((j) => j.id);
  const [inputs, setInputs] = useState<Record<string, string>>(() => marksToInputs(applied.marks));
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ApplyTeamDanceResult | null>(null);

  const appliedKey = marksKey(applied.marks);
  // Marks already in the members' drafts fill the boxes until the person
  // starts typing; a successful apply hands the boxes back to that sync.
  useEffect(() => {
    if (!dirty && applied.marks) setInputs(marksToInputs(applied.marks));
  }, [appliedKey, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = parseTeamMarks(inputs, judgeIds);
  const panelOk = judges.length === TEAM_DANCE_JUDGE_COUNT;
  // Apply when the four marks change, and again when a member becomes
  // eligible later (their own dance was saved after the team was scored).
  // Each distinct marks + members key is attempted once, so a server
  // decision that differs from the preview can never loop.
  const waitingIds = plan.filter((p) => p.state === "will_apply").map((p) => p.coupleId).sort().join(",");
  const attemptKey =
    parsed.marks && panelOk && (!sameTeamMarks(parsed.marks, applied.marks) || waitingIds !== "")
      ? `${marksKey(parsed.marks)}|${waitingIds}`
      : "";
  const attemptedKey = useRef("");
  const pending = attemptKey !== "" && attemptedKey.current !== attemptKey;

  useEffect(() => {
    if (!pending || inputsDisabled || !parsed.marks) return;
    const marks = parsed.marks;
    const timer = setTimeout(async () => {
      attemptedKey.current = attemptKey;
      setApplying(true);
      setError(null);
      const outcome = await onApply(team.id, marks);
      setApplying(false);
      if (outcome.error) setError(outcome.error);
      else {
        setLastResult(outcome.result ?? null);
        setDirty(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [attemptKey, pending, inputsDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const appliesTo = plan.filter((p) => APPLIES_STATES.has(p.state));
  const liveMarks = parsed.marks ?? applied.marks;
  const liveTotal = liveMarks ? teamMarksTotal(liveMarks) : null;
  // A member posted with an earlier team score keeps it live until they are
  // un-posted and posted again, just like one posted before any team score.
  const isStale = (p: TeamMemberPlan) =>
    p.state === "posted_applied" && liveTotal != null && p.liveTeamTotal != null && p.liveTeamTotal !== liveTotal;
  const needsOverride = plan.filter((p) => p.state === "posted_waiting" || isStale(p));
  const missingNames = judgeIds
    .filter((id) => (inputs[id] ?? "").trim() === "")
    .map((id) => judgeNames.get(id) ?? "a judge");
  const guestNames = judges.filter((j) => guestJudgeIds.has(j.id)).map((j) => judgeNames.get(j.id) ?? j.name);
  // Running total of whatever valid marks are typed so far (27/40 at three of four).
  const typedTotal = judgeIds.reduce((sum, id) => {
    const raw = (inputs[id] ?? "").trim();
    const n = Number(raw);
    return raw !== "" && Number.isFinite(n) && n >= 0 && n <= TEAM_DANCE_MAX_PER_JUDGE ? sum + n : sum;
  }, 0);

  let status: { tone: Tone; text: string } | null = null;
  if (parsed.invalidJudgeIds.length > 0) {
    const judgeId = parsed.invalidJudgeIds[0];
    status = {
      tone: "danger",
      text: `Judge scores must be between 0 and ${TEAM_DANCE_MAX_PER_JUDGE}. ${judgeNames.get(judgeId) ?? "That"}'s ${inputs[judgeId]?.trim()} isn't saved.`,
    };
  } else if (parsed.filled < judgeIds.length) {
    status = {
      tone: parsed.filled === 0 ? "muted" : "warn",
      text:
        parsed.filled === 0
          ? `0 of ${judgeIds.length} judges in. Waiting for the team dance.`
          : `${parsed.filled} of ${judgeIds.length} judges in. Nothing reaches the couples until ${missingNames.join(" and ")}'s score is in, so each couple's own dance can still be posted.`,
    };
  } else if (applying || pending) {
    status = { tone: "muted", text: `All ${judgeIds.length} judges in. Saving to ${appliesTo.length} couples…` };
  } else if (parsed.marks) {
    status = {
      tone: "ok",
      text: `All ${judgeIds.length} judges in. Saved as Dance 2 for ${appliesTo.length} ${appliesTo.length === 1 ? "couple" : "couples"}, as drafts.`,
    };
  }

  return (
    <div className="rounded-xl border border-accent/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <strong>{team.name}</strong> <span className="font-normal text-muted-foreground">· Team Dance</span>
        </p>
        {canSetup && (
          <Button size="xs" variant="ghost" onClick={onEditTeams} disabled={busy}>
            Edit Teams
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {plan.map((p, i) => (
          <span key={p.coupleId}>
            {i > 0 && ", "}
            {coupleName(p.coupleId)}
            {team.captainCoupleId === p.coupleId && " (Captain)"}
          </span>
        ))}
        {team.hostName && ` · Host ${team.hostName} dances, not scored`}
        {team.inferred && " · Read from the couples' second slot"}
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
              <span>0 to {TEAM_DANCE_MAX_PER_JUDGE} per judge · copied to every member&apos;s Dance 2</span>
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
      {applied.mismatch && (
        <p className="mt-1.5 text-xs text-amber-text">
          Members&apos; team rows don&apos;t all agree. Entering the marks again rewrites every member.
        </p>
      )}
      {lastResult && lastResult.collisions.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-text">
          Not applied to {lastResult.collisions.length} {lastResult.collisions.length === 1 ? "couple" : "couples"}: a couple
          takes the team dance only once their own dance is saved and they have no extra dance rows.
        </p>
      )}

      <div className="mt-2 flex flex-col rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>
            Applies to {appliesTo.length} of {plan.length} couples
          </span>
          <span className="normal-case tracking-normal">Each couple&apos;s Dance 2</span>
        </div>
        {plan.map((p) => {
          const state = isStale(p) ? { label: "Posted · Old Team Score", tone: "warn" as Tone } : memberStateLabel(p);
          return (
            <div key={p.coupleId} className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-2.5 py-1 text-sm last:border-b-0">
              <span className="flex flex-wrap items-center gap-1.5">
                {coupleName(p.coupleId)}
                {team.captainCoupleId === p.coupleId && <Badge variant="outline">Captain</Badge>}
              </span>
              <span className={`shrink-0 text-xs ${TONE_CLASS[state.tone]}`}>{state.label}</span>
            </div>
          );
        })}
      </div>

      {needsOverride.map((p) => (
        <div key={p.coupleId} className="mt-2 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          {canOverride ? (
            <>
              <p className="text-danger-text">
                {isStale(p) ? (
                  <>
                    {coupleName(p.coupleId)} were posted with the team score at {p.liveTeamTotal}; the team is now {liveTotal}. A
                    posted couple keeps the old marks until they are posted again.
                  </>
                ) : (
                  <>
                    {coupleName(p.coupleId)} were posted before the team was scored. A posted couple ignores new dances, so their
                    night is {view.individualTotals[p.coupleId] ?? 0}
                    {liveTotal != null ? `, not ${(view.individualTotals[p.coupleId] ?? 0) + liveTotal}` : ""}.
                  </>
                )}
              </p>
              <Button
                size="sm"
                className="self-start"
                disabled={!liveMarks || busy || overriding != null}
                onClick={async () => {
                  if (!liveMarks) return;
                  setOverriding(p.coupleId);
                  setError(null);
                  const outcome = await onOverride(team.id, p.coupleId, liveMarks);
                  setOverriding(null);
                  if (outcome.error) setError(outcome.error);
                }}
              >
                {overriding === p.coupleId ? "Working…" : "Un-Post and Apply"}
              </Button>
              <p className="text-muted-foreground">
                Un-posts {coupleName(p.coupleId)}, saves the team score into their Dance 2 and posts them again. Each step
                rewrites this week in every league.
              </p>
            </>
          ) : (
            <p className="text-danger-text">
              {coupleName(p.coupleId)} are already posted, so this team score can&apos;t reach them yet. It&apos;s saved
              for the other couples. A site admin needs to un-post them to {isStale(p) ? "update" : "add"} it. Nothing
              for you to do.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
