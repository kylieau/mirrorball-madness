import { roundPoints } from "./format-points";
import { collapseToNights, scaledJudgesScore } from "./scoring";

// Team Dances are scored by exactly four judges (the standing panel plus the
// night's guest), out of 40. apply_team_dance enforces the same count.
export const TEAM_DANCE_JUDGE_COUNT = 4;
export const TEAM_DANCE_MAX_PER_JUDGE = 10;

export type EpisodeTeam = {
  id: string;
  episodeId: string;
  name: string;
  songTitle: string | null;
  songSource: string | null;
  danceStyleId: string;
  captainCoupleId: string | null;
  hostName: string | null;
  sortOrder: number;
  memberCoupleIds: string[];
  // Inferred teams are read off the couples' own slot-2 rows (a shared
  // Freestyle and song on a Team Dance night) -- the fallback before
  // supabase/apply-team-dance-entity.sql is applied. They have no captain or
  // host and are named after their song.
  inferred: boolean;
  // When the team's score went live (entity model), else null.
  postedAt: string | null;
};

export type TeamMark = { judgeId: string; score: number };

type DanceSignature = { danceStyleId: string; songTitle: string | null };

// Case- and whitespace-insensitive, the same key team_song_key() uses in SQL.
export function songKey(song: string | null | undefined): string {
  return (song ?? "").trim().toLowerCase();
}

// A member's team dance is whichever draft row carries the team's style and
// song -- never "the second slot". Mirrors the signature apply_team_dance uses.
export function isTeamDanceRow(team: DanceSignature, dance: DanceSignature): boolean {
  return dance.danceStyleId === team.danceStyleId && songKey(dance.songTitle) === songKey(team.songTitle);
}

export const INFERRED_TEAM_PREFIX = "inferred:";

// Names for teams read off the draft, keyed by songKey(). A saved team
// (supabase/apply-team-dance-entity.sql) carries its own name; without one this is
// the only place a name can live, and an unknown song names the team after
// itself.
export const KNOWN_TEAM_NAMES_BY_SONG: Record<string, string> = {
  zoo: "Slaytopia",
  "we're all in this together": "Wildcats",
  "we’re all in this together": "Wildcats",
};

export function inferredTeamName(songTitle: string | null): string {
  return KNOWN_TEAM_NAMES_BY_SONG[songKey(songTitle)] ?? songTitle?.trim() ?? "Team Dance";
}

// Teams read off the draft itself: on a Team Dance night, two or more couples
// whose rows share a Freestyle and the same song are one team. This is what
// the live Week 8 data already looks like (every couple's second slot holds
// the team's Freestyle and song), so it needs no migration. A row's style
// must be one of `teamStyleIds` (styles named like Freestyle).
export function inferTeamsFromRows(
  episodeId: string,
  couples: { coupleId: string; dances: DanceSignature[] }[],
  teamStyleIds: ReadonlySet<string>
): EpisodeTeam[] {
  const groups = new Map<string, { danceStyleId: string; songTitle: string | null; memberCoupleIds: string[] }>();
  for (const couple of couples) {
    const seen = new Set<string>();
    for (const dance of couple.dances) {
      if (!teamStyleIds.has(dance.danceStyleId)) continue;
      const key = `${dance.danceStyleId}|${songKey(dance.songTitle)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? { danceStyleId: dance.danceStyleId, songTitle: dance.songTitle?.trim() || null, memberCoupleIds: [] };
      group.memberCoupleIds.push(couple.coupleId);
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .filter(([, group]) => group.memberCoupleIds.length >= 2)
    .map(([key, group], index) => ({
      id: `${INFERRED_TEAM_PREFIX}${key}`,
      episodeId,
      name: inferredTeamName(group.songTitle),
      songTitle: group.songTitle,
      songSource: null,
      danceStyleId: group.danceStyleId,
      captainCoupleId: null,
      hostName: null,
      sortOrder: index + 1,
      memberCoupleIds: group.memberCoupleIds,
      inferred: true,
      postedAt: null,
    }));
}

export function isTeamStyleName(name: string): boolean {
  return /freestyle/i.test(name);
}

export type ParsedTeamMarks = {
  marks: TeamMark[] | null;
  filled: number;
  invalidJudgeIds: string[];
};

// The card's boxes as typed. Complete only when every one of the night's
// judges has a number from 0 to 10; nothing is written before that.
export function parseTeamMarks(inputs: Record<string, string>, judgeIds: string[]): ParsedTeamMarks {
  const invalidJudgeIds: string[] = [];
  const marks: TeamMark[] = [];
  let filled = 0;
  for (const judgeId of judgeIds) {
    const raw = (inputs[judgeId] ?? "").trim();
    if (raw === "") continue;
    filled += 1;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > TEAM_DANCE_MAX_PER_JUDGE) invalidJudgeIds.push(judgeId);
    else marks.push({ judgeId, score });
  }
  const complete =
    judgeIds.length === TEAM_DANCE_JUDGE_COUNT && invalidJudgeIds.length === 0 && marks.length === judgeIds.length;
  return { marks: complete ? marks : null, filled, invalidJudgeIds };
}

export function teamMarksTotal(marks: TeamMark[]): number {
  return marks.reduce((sum, m) => sum + m.score, 0);
}

export function sameTeamMarks(a: TeamMark[] | null, b: TeamMark[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const byJudge = new Map(a.map((m) => [m.judgeId, m.score]));
  return b.every((m) => byJudge.get(m.judgeId) === m.score);
}

export type MemberDanceRow = DanceSignature & { scores: Record<string, string> };

export type TeamEligibilityInput = {
  coupleId: string;
  status: string;
  eliminationWeek: number | null;
  // The draft outcome row for this episode, when one exists.
  outcome: string | null;
};

export type SkipReason = "withdrawn" | "bye" | "eliminated" | "not_performing";

// Mirrors team_eligible_members(): on the team, in tonight's cast, not
// withdrawn, Did Not Dance, or eliminated before this week. Shared by the
// publication and team-post planners and by the team entry's member list.
export function eligibleTeamMembers(
  team: Pick<EpisodeTeam, "memberCoupleIds">,
  members: TeamEligibilityInput[],
  opts: { weekNumber: number | null; participantIds: string[] }
): { eligible: string[]; skipped: { coupleId: string; reason: SkipReason }[] } {
  const restricted = opts.participantIds.length > 0;
  const performing = new Set(opts.participantIds);
  const eligible: string[] = [];
  const skipped: { coupleId: string; reason: SkipReason }[] = [];
  for (const coupleId of team.memberCoupleIds) {
    const member = members.find((m) => m.coupleId === coupleId);
    if (!member) continue;
    if (member.outcome === "bye") skipped.push({ coupleId, reason: "bye" });
    else if (member.outcome === "withdrawn" || member.status === "withdrawn") skipped.push({ coupleId, reason: "withdrawn" });
    else if (
      member.status === "eliminated" &&
      (member.eliminationWeek == null || opts.weekNumber == null || member.eliminationWeek < opts.weekNumber)
    )
      skipped.push({ coupleId, reason: "eliminated" });
    else if (restricted && !performing.has(coupleId)) skipped.push({ coupleId, reason: "not_performing" });
    else eligible.push(coupleId);
  }
  return { eligible, skipped };
}

export type TeamMemberInput = {
  coupleId: string;
  status: string;
  eliminationWeek: number | null;
  // The draft outcome row for this episode, when one exists.
  outcome: string | null;
  dances: MemberDanceRow[];
  posted: boolean;
  // The couple's live dance rows while the episode is unpublished.
  liveDances: (DanceSignature & { totalScore: number })[];
};

export type TeamMemberState =
  | "will_apply"
  | "applied"
  | "posted_applied"
  | "posted_waiting"
  | "skipped"
  | "collision";

export type TeamMemberPlan = {
  coupleId: string;
  state: TeamMemberState;
  // For skipped: why. For collision: how many non-team dances were found.
  reason: "withdrawn" | "bye" | "eliminated" | "not_performing" | null;
  otherDances: number;
  appliedMarks: TeamMark[] | null;
  // The total of the team dance that is live for a posted member, so the
  // card can tell when the team was re-scored after they were posted.
  liveTeamTotal: number | null;
};

function marksFromRow(row: MemberDanceRow, judgeIds: string[]): TeamMark[] | null {
  const marks: TeamMark[] = [];
  for (const judgeId of judgeIds) {
    const raw = (row.scores[judgeId] ?? "").trim();
    if (raw === "") return null;
    const score = Number(raw);
    if (!Number.isFinite(score)) return null;
    marks.push({ judgeId, score });
  }
  return marks.length === TEAM_DANCE_JUDGE_COUNT ? marks : null;
}

// Client-side preview of what apply_team_dance will do for each member. The
// RPC is authoritative; this keeps the "Applies to N of M" list honest before
// and after the call.
export function teamApplyPlan(
  team: EpisodeTeam,
  members: TeamMemberInput[],
  opts: { weekNumber: number | null; participantIds: string[]; judgeIds: string[] }
): TeamMemberPlan[] {
  const restricted = opts.participantIds.length > 0;
  const performing = new Set(opts.participantIds);
  return team.memberCoupleIds.flatMap((coupleId) => {
    const member = members.find((m) => m.coupleId === coupleId);
    if (!member) return [];
    const liveTeamTotal = member.posted ? (member.liveDances.find((d) => isTeamDanceRow(team, d))?.totalScore ?? null) : null;
    const base = { coupleId, reason: null, otherDances: 0, appliedMarks: null, liveTeamTotal } satisfies Omit<TeamMemberPlan, "state">;
    if (member.outcome === "bye") return [{ ...base, state: "skipped", reason: "bye" } as TeamMemberPlan];
    if (member.outcome === "withdrawn" || member.status === "withdrawn")
      return [{ ...base, state: "skipped", reason: "withdrawn" } as TeamMemberPlan];
    if (
      member.status === "eliminated" &&
      (member.eliminationWeek == null || opts.weekNumber == null || member.eliminationWeek < opts.weekNumber)
    )
      return [{ ...base, state: "skipped", reason: "eliminated" } as TeamMemberPlan];
    if (restricted && !performing.has(coupleId))
      return [{ ...base, state: "skipped", reason: "not_performing" } as TeamMemberPlan];
    const real = member.dances.filter((d) => d.danceStyleId);
    const teamRows = real.filter((d) => isTeamDanceRow(team, d));
    const otherDances = real.length - teamRows.length;
    if (teamRows.length === 0) {
      if (otherDances !== 1) return [{ ...base, state: "collision", otherDances } as TeamMemberPlan];
      return [{ ...base, state: member.posted ? "posted_waiting" : "will_apply", otherDances } as TeamMemberPlan];
    }
    if (teamRows.length > 1) return [{ ...base, state: "collision", otherDances } as TeamMemberPlan];
    const appliedMarks = marksFromRow(teamRows[0], opts.judgeIds);
    if (member.posted) {
      return [{ ...base, state: liveTeamTotal == null ? "posted_waiting" : "posted_applied", otherDances, appliedMarks } as TeamMemberPlan];
    }
    return [{ ...base, state: appliedMarks ? "applied" : "will_apply", otherDances, appliedMarks } as TeamMemberPlan];
  });
}

// The marks the team already carries in members' drafts, plus whether every
// member agrees (a disagreement means someone's row was edited by hand).
export function appliedTeamMarks(plan: TeamMemberPlan[]): { marks: TeamMark[] | null; mismatch: boolean } {
  const sets = plan.map((p) => p.appliedMarks).filter((m): m is TeamMark[] => m != null);
  if (sets.length === 0) return { marks: null, mismatch: false };
  return { marks: sets[0], mismatch: sets.some((m) => !sameTeamMarks(m, sets[0])) };
}

export type NightSummaryDance = {
  marks: number[];
  teamName: string | null;
};

export type NightSummaryRow = {
  coupleId: string;
  individualTotal: number;
  teamParts: { teamName: string; total: number }[];
  nightTotal: number;
  maxPossible: number;
  // The night on the 30-point basis Dance Card pays on, through the engine's
  // own collapse. Preview only; nothing stores it.
  danceCardPreview: number;
  tag: "top" | "within1" | "within2" | null;
};

// Frame 08: Individual + Team = Night out of 80, Dance Card out of 30, with
// Curtain Call's raw-total bands. Ties at the top all read Top Scorer.
export function buildNightSummary(
  couples: { coupleId: string; dances: NightSummaryDance[] }[]
): NightSummaryRow[] {
  const rows = couples
    .filter((c) => c.dances.some((d) => d.marks.length > 0))
    .map((c) => {
      const totals = c.dances.map((d) => d.marks.reduce((sum, n) => sum + n, 0));
      const [night] = collapseToNights(
        c.dances.map((d, i) => ({ episodeId: "", coupleId: c.coupleId, totalScore: totals[i], scaledScore: scaledJudgesScore(d.marks) }))
      );
      return {
        coupleId: c.coupleId,
        individualTotal: c.dances.reduce((sum, d, i) => sum + (d.teamName ? 0 : totals[i]), 0),
        teamParts: c.dances.flatMap((d, i) => (d.teamName ? [{ teamName: d.teamName, total: totals[i] }] : [])),
        nightTotal: night.totalScore,
        maxPossible: night.maxScore,
        danceCardPreview: roundPoints(night.scaledScore),
        tag: null as NightSummaryRow["tag"],
      };
    })
    .sort((a, b) => b.nightTotal - a.nightTotal);
  const top = rows[0]?.nightTotal ?? 0;
  for (const row of rows) {
    const gap = top - row.nightTotal;
    row.tag = gap === 0 ? "top" : gap <= 1 ? "within1" : gap <= 2 ? "within2" : null;
  }
  return rows;
}

export type TeamSetupInput = {
  id: string | null;
  name: string;
  songTitle: string | null;
  songSource: string | null;
  danceStyleId: string | null;
  captainCoupleId: string | null;
  hostName: string | null;
  sortOrder: number;
  memberCoupleIds: string[];
};

// Client-side mirror of save_episode_teams' checks so the editor can explain
// a problem before the round trip. The RPC still enforces every rule.
export function validateTeamSetup(teams: TeamSetupInput[]): string | null {
  const names = new Set<string>();
  const members = new Set<string>();
  for (const team of teams) {
    const name = team.name.trim();
    if (!name) return "Every team needs a name.";
    if (names.has(name.toLowerCase())) return `Two teams are both called "${name}".`;
    names.add(name.toLowerCase());
    if (new Set(team.memberCoupleIds).size < 2) return `Team "${name}" needs at least two couples.`;
    for (const coupleId of team.memberCoupleIds) {
      if (members.has(coupleId)) return "A couple can be on only one team per night.";
      members.add(coupleId);
    }
    if (team.captainCoupleId && !team.memberCoupleIds.includes(team.captainCoupleId))
      return `The captain of "${name}" must be on the team.`;
  }
  return null;
}
