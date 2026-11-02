"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScoringJudge } from "@/lib/scoring-judges";
import type { ApplyTeamDanceResult } from "@/lib/episode-teams";
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

export type TeamCardView = {
  team: EpisodeTeam;
  styleName: string;
  plan: TeamMemberPlan[];
  applied: { marks: TeamMark[] | null; mismatch: boolean };
  // Each member's own (non-team) marks so far, for the posted-member warning.
  individualTotals: Record<string, number>;
};

export type ApplyOutcome = { error: string | null; result?: ApplyTeamDanceResult };

const APPLIES_STATES = new Set<TeamMemberPlan["state"]>(["will_apply", "applied", "posted_applied"]);

function marksToInputs(marks: TeamMark[] | null): Record<string, string> {
  return Object.fromEntries((marks ?? []).map((m) => [m.judgeId, String(m.score)]));
}

function marksKey(marks: TeamMark[] | null): string {
  return (marks ?? []).map((m) => `${m.judgeId}:${m.score}`).sort().join(",");
}

function memberStateLabel(plan: TeamMemberPlan): { label: string; tone: "muted" | "ok" | "danger" | "warn" } {
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
        tone: "muted",
      };
    case "collision":
      return {
        label: plan.otherDances === 0 ? "Needs Their Own Dance First" : `${plan.otherDances} Dances Already · Can't Apply`,
        tone: "warn",
      };
  }
}

const TONE_CLASS = {
  muted: "text-muted-foreground",
  ok: "text-emerald-text",
  danger: "text-danger-text",
  warn: "text-amber-text",
} as const;

// One team: name, song and host, four judge boxes, and the live "Applies to
// N of M" list. Nothing is written until every box holds a valid mark; the
// fourth valid mark saves the team dance into every eligible member's draft.
function TeamBlock({
  view,
  judges,
  judgeNames,
  guestJudgeIds,
  coupleName,
  canOverride,
  inputsDisabled,
  busy,
  onApply,
  onOverride,
}: {
  view: TeamCardView;
  judges: ScoringJudge[];
  judgeNames: Map<string, string>;
  guestJudgeIds: ReadonlySet<string>;
  coupleName: (coupleId: string) => ReactNode;
  canOverride: boolean;
  inputsDisabled: boolean;
  busy: boolean;
  onApply: (teamId: string, marks: TeamMark[]) => Promise<ApplyOutcome>;
  onOverride: (teamId: string, coupleId: string, marks: TeamMark[]) => Promise<{ error: string | null }>;
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
  const pendingMarks = parsed.marks && !sameTeamMarks(parsed.marks, applied.marks) ? parsed.marks : null;
  const pendingKey = marksKey(pendingMarks);

  useEffect(() => {
    if (!pendingMarks || inputsDisabled || !panelOk) return;
    const timer = setTimeout(async () => {
      setApplying(true);
      setError(null);
      const outcome = await onApply(team.id, pendingMarks);
      setApplying(false);
      if (outcome.error) setError(outcome.error);
      else {
        setLastResult(outcome.result ?? null);
        setDirty(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [pendingKey, inputsDisabled, panelOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const appliesTo = plan.filter((p) => APPLIES_STATES.has(p.state));
  const postedWaiting = plan.filter((p) => p.state === "posted_waiting");
  const missingNames = judgeIds
    .filter((id) => (inputs[id] ?? "").trim() === "")
    .map((id) => judgeNames.get(id) ?? "a judge");
  const guestNames = judges.filter((j) => guestJudgeIds.has(j.id)).map((j) => judgeNames.get(j.id) ?? j.name);
  const total = parsed.marks ? teamMarksTotal(parsed.marks) : null;
  const liveMarks = parsed.marks ?? applied.marks;

  let status: { tone: "muted" | "ok" | "danger" | "warn"; text: string } | null = null;
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
  } else if (applying || pendingMarks) {
    status = { tone: "muted", text: `All ${judgeIds.length} judges in. Saving to ${appliesTo.length} couples…` };
  } else if (parsed.marks) {
    status = {
      tone: "ok",
      text: `All ${judgeIds.length} judges in. Saved to each couple's team dance for ${appliesTo.length} ${appliesTo.length === 1 ? "couple" : "couples"}, as drafts.`,
    };
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-base font-semibold">{team.name}</p>
          <Badge variant="secondary">{view.styleName}</Badge>
        </div>
        {(team.songTitle || team.songSource) && (
          <p className="text-xs text-muted-foreground">
            {team.songTitle ? `“${team.songTitle}”` : ""}
            {team.songTitle && team.songSource ? " · " : ""}
            {team.songSource ?? ""}
          </p>
        )}
        {team.hostName && <p className="text-xs text-muted-foreground">Host {team.hostName} dances, not scored</p>}
      </div>

      {panelOk ? (
        <fieldset disabled={inputsDisabled || busy} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-end gap-1.5">
            {judges.map((j) => (
              <div key={j.id} className="flex flex-col gap-0.5">
                <Label className={`text-[11px] ${guestJudgeIds.has(j.id) ? "text-accent" : "text-muted-foreground"}`}>
                  {judgeNames.get(j.id) ?? j.name}
                </Label>
                <Input
                  inputMode="decimal"
                  aria-label={`${judgeNames.get(j.id) ?? j.name} mark for ${team.name}`}
                  className={`h-11 w-14 px-1.5 text-center text-base ${parsed.invalidJudgeIds.includes(j.id) ? "border-destructive" : ""}`}
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
              <Label className="text-[11px] text-muted-foreground">Team</Label>
              <p className="flex h-11 items-center px-1 font-heading text-lg font-semibold">
                {total ?? teamMarksTotal(liveMarks ?? [])}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">/{judgeIds.length * TEAM_DANCE_MAX_PER_JUDGE}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 text-[11px] text-muted-foreground">
            <span>0 to {TEAM_DANCE_MAX_PER_JUDGE} per judge</span>
            <span>
              {guestNames.length > 0 ? `${guestNames.join(" and ")} ${guestNames.length === 1 ? "is" : "are"} tonight's guest · ` : ""}
              {parsed.filled} of {judgeIds.length} in
            </span>
          </div>
        </fieldset>
      ) : (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-text">
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
          className={`rounded-lg border px-3 py-2 text-xs ${
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
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
      {applied.mismatch && (
        <p className="text-xs text-amber-text">
          Members&apos; team rows don&apos;t all agree. Entering the marks again rewrites every member.
        </p>
      )}
      {lastResult && lastResult.collisions.length > 0 && (
        <p className="text-xs text-amber-text">
          Not applied to {lastResult.collisions.length} {lastResult.collisions.length === 1 ? "couple" : "couples"}: a couple
          takes the team dance only once their own dance is saved and they have no extra dance rows.
        </p>
      )}

      <div className="flex flex-col rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>
            Applies to {appliesTo.length} of {plan.length} couples
          </span>
          <span className="normal-case tracking-normal">Saved as each couple&apos;s team dance</span>
        </div>
        {plan.map((p) => {
          const state = memberStateLabel(p);
          return (
            <div key={p.coupleId} className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-b-0">
              <span className="flex flex-wrap items-center gap-1.5">
                {coupleName(p.coupleId)}
                {team.captainCoupleId === p.coupleId && <Badge variant="outline">Captain</Badge>}
              </span>
              <span className={`shrink-0 text-xs ${TONE_CLASS[state.tone]}`}>{state.label}</span>
            </div>
          );
        })}
      </div>

      {postedWaiting.map((p) => (
        <div key={p.coupleId} className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          {canOverride ? (
            <>
              <p className="text-danger-text">
                {coupleName(p.coupleId)} were posted before the team was scored. A posted couple ignores new dances, so their
                night is {view.individualTotals[p.coupleId] ?? 0}
                {liveMarks ? `, not ${(view.individualTotals[p.coupleId] ?? 0) + teamMarksTotal(liveMarks)}` : ""}.
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
                {overriding === p.coupleId ? "Working…" : <>Un-Post {coupleName(p.coupleId)} and Add Team Score</>}
              </Button>
              <p className="text-muted-foreground">
                Un-posts them, adds the team score and posts them again. Each step rewrites this week in every league.
              </p>
            </>
          ) : (
            <p className="text-danger-text">
              {coupleName(p.coupleId)} are already posted, so this team score can&apos;t reach them yet. It&apos;s saved
              for the other couples. A site admin needs to un-post them to add it. Nothing for you to do.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function TeamDancesCard({
  teams,
  judges,
  judgeNames,
  guestJudgeIds,
  coupleName,
  canSetup,
  canOverride,
  inputsDisabled,
  busy,
  onApply,
  onOverride,
  onEditTeams,
}: {
  teams: TeamCardView[];
  judges: ScoringJudge[];
  judgeNames: Map<string, string>;
  guestJudgeIds: ReadonlySet<string>;
  coupleName: (coupleId: string) => ReactNode;
  canSetup: boolean;
  canOverride: boolean;
  inputsDisabled: boolean;
  busy: boolean;
  onApply: (teamId: string, marks: TeamMark[]) => Promise<ApplyOutcome>;
  onOverride: (teamId: string, coupleId: string, marks: TeamMark[]) => Promise<{ error: string | null }>;
  onEditTeams: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Team Dances</CardTitle>
          <div className="flex items-center gap-2">
            {teams.length > 0 && (
              <Badge variant="secondary">
                {teams.length} {teams.length === 1 ? "Team" : "Teams"}
              </Badge>
            )}
            {canSetup && (
              <Button size="sm" variant="outline" onClick={onEditTeams} disabled={busy}>
                {teams.length === 0 ? "Set Up Teams" : "Edit Teams"}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          {teams.length === 0
            ? canSetup
              ? "Set up each team's name, song and members, then type one set of judge marks per team."
              : "No teams are set up yet. Ask a site admin to add them, or type the team's marks into each couple's second dance slot."
            : "Type each team's scores once. They apply to every member who danced."}
        </CardDescription>
      </CardHeader>
      {teams.length > 0 && (
        <CardContent className="flex flex-col gap-3">
          {teams.map((view) => (
            <TeamBlock
              key={view.team.id}
              view={view}
              judges={judges}
              judgeNames={judgeNames}
              guestJudgeIds={guestJudgeIds}
              coupleName={coupleName}
              canOverride={canOverride}
              inputsDisabled={inputsDisabled}
              busy={busy}
              onApply={onApply}
              onOverride={onOverride}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
