import { roundPoints } from "./format-points";
import { isValidMark } from "./judge-marks";
import { collapseToNights, MARK_MAX, scaledJudgesScore } from "./scoring";

// A special dance takes marks from the night's judges: the standing panel plus
// that episode's guests, 2 to 4 of them. The SQL checks the same bounds
// (episode_teams_special_checks, save_team_marks).
export const SPECIAL_DANCE_MIN_JUDGES = 2;
export const SPECIAL_DANCE_MAX_JUDGES = 4;
export const SPECIAL_DANCE_MAX_SONGS = 4;
export const SPECIAL_DANCE_MAX_DETAILS = 12;
export const SPECIAL_DANCE_POINTS_LIMIT = 100;
export const DEFAULT_DANCE_TYPE = "Team Dance";
export const DEFAULT_MARK_MAX = MARK_MAX;

export const DANCE_TYPE_SUGGESTIONS = [
  "Team Dance",
  "Dance-Off",
  "Marathon",
  "Relay",
  "Trio",
  "Team-Up",
  "Challenge",
  "Immunity",
  "Other",
] as const;
export const DETAIL_LABEL_SUGGESTIONS = ["Host", "Captain", "Live Performer", "Dedicated To", "Third Dancer", "Coached By"] as const;
export const THEME_LABELS = ["Film", "Show", "Musical", "Album", "Person", "Era", "Other"] as const;
export const RESULT_SUGGESTIONS = ["Winner", "Loser", "Immune", "1st", "2nd", "3rd", "4th", "5th"] as const;

export type SpecialDanceScoringMode = "marks" | "points";
export type SpecialDanceSong = { title: string; artist: string | null };
export type SpecialDanceDetail = { label: string; value: string; coupleId: string | null };

// One special dance of an episode: a team dance, dance-off, marathon, relay,
// trio, or anything else the show invents. Stored in episode_teams (the table
// keeps its name); members in episode_team_members. Never a couple.
export type SpecialDance = {
  id: string;
  episodeId: string;
  name: string;
  nameIsAuto: boolean;
  danceType: string;
  scoringMode: SpecialDanceScoringMode;
  // Stored, but the app no longer sets either: every dance is out of 10 on
  // the night's panel (null), which episode_teams_night_panel pins. The
  // publication math still reads them, so they go together (BACKLOG).
  markMax: number;
  panelJudgeIds: string[] | null;
  danceStyleId: string;
  secondDanceStyleId: string | null;
  songs: SpecialDanceSong[];
  // Mirror of songs[0].title, kept for older readers.
  songTitle: string | null;
  // Theme/Source: the free text plus its label (Film, Show, Musical, ...).
  songSource: string | null;
  themeLabel: string | null;
  details: SpecialDanceDetail[];
  // Mirrors of the Captain and Host details, kept for older readers.
  captainCoupleId: string | null;
  hostName: string | null;
  sortOrder: number;
  memberCoupleIds: string[];
  // Inferred teams are read off the couples' own slot-2 rows (a shared
  // Freestyle and song on a Team Dance night) -- the fallback before
  // supabase/apply-team-dance-entity.sql is applied. They have no captain or
  // host and are named after their song.
  inferred: boolean;
  // When the dance's score went live (entity model), else null.
  postedAt: string | null;
  updatedAt: string | null;
};

export type TeamMark = { judgeId: string; score: number };
// A participant's draft points and result in a Points-mode special dance
// (episode_team_scores, service-only until posted).
export type SpecialDanceScore = { coupleId: string; points: number | null; result: string | null };

type DanceSignature = { danceStyleId: string; songTitle: string | null };

export function isHalfStep(value: number): boolean {
  return Number.isFinite(value) && value * 2 === Math.trunc(value * 2);
}

export function isValidPoints(points: number): boolean {
  return isHalfStep(points) && Math.abs(points) <= SPECIAL_DANCE_POINTS_LIMIT;
}

// The judges whose marks a special dance takes: its own panel when one was
// chosen, else the night's. Mirrors special_dance_panel() in SQL.
export function specialDancePanel(dance: Pick<SpecialDance, "panelJudgeIds">, nightJudgeIds: string[]): string[] {
  return dance.panelJudgeIds ?? nightJudgeIds;
}

// Case- and whitespace-insensitive, the same key team_song_key() uses in SQL.
export function songKey(song: string | null | undefined): string {
  return (song ?? "").trim().toLowerCase();
}

// A member's team dance is whichever draft row carries the team's style and
// song -- never "the second slot". Mirrors the signature the inferred
// fallback applies.
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
  return KNOWN_TEAM_NAMES_BY_SONG[songKey(songTitle)] ?? songTitle?.trim() ?? DEFAULT_DANCE_TYPE;
}

// The columns a special dance row carries before apply-special-dances.sql
// runs, filled with the values every existing team has after it.
export function legacyTeamDefaults(team: {
  songTitle: string | null;
  captainCoupleId: string | null;
  hostName: string | null;
  captainName?: string | null;
}): Pick<
  SpecialDance,
  "nameIsAuto" | "danceType" | "scoringMode" | "markMax" | "panelJudgeIds" | "secondDanceStyleId" | "songs" | "themeLabel" | "details" | "updatedAt"
> {
  const details: SpecialDanceDetail[] = [];
  if (team.captainCoupleId) details.push({ label: "Captain", value: team.captainName ?? "", coupleId: team.captainCoupleId });
  if (team.hostName) details.push({ label: "Host", value: team.hostName, coupleId: null });
  return {
    nameIsAuto: false,
    danceType: DEFAULT_DANCE_TYPE,
    scoringMode: "marks",
    markMax: DEFAULT_MARK_MAX,
    panelJudgeIds: null,
    secondDanceStyleId: null,
    songs: team.songTitle ? [{ title: team.songTitle, artist: null }] : [],
    themeLabel: null,
    details,
    updatedAt: null,
  };
}

// Teams read off the draft itself: on a Team Dance night, two or more couples
// whose rows share a Freestyle and the same song are one team. This is what
// the live Week 8 data looked like before the entity migration (every
// couple's second slot held the team's Freestyle and song), so it needs no
// migration. A row's style must be one of `teamStyleIds` (styles named like
// Freestyle).
export function inferTeamsFromRows(
  episodeId: string,
  couples: { coupleId: string; dances: DanceSignature[] }[],
  teamStyleIds: ReadonlySet<string>
): SpecialDance[] {
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
      ...legacyTeamDefaults({ songTitle: group.songTitle, captainCoupleId: null, hostName: null }),
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

// The card's boxes as typed. Complete only when every one of the dance's
// judges (2 to 4 of them) has a valid mark; nothing is posted before that.
export function parseTeamMarks(inputs: Record<string, string>, judgeIds: string[]): ParsedTeamMarks {
  const invalidJudgeIds: string[] = [];
  const marks: TeamMark[] = [];
  let filled = 0;
  for (const judgeId of judgeIds) {
    const raw = (inputs[judgeId] ?? "").trim();
    if (raw === "") continue;
    filled += 1;
    const score = Number(raw);
    if (!isValidMark(score)) invalidJudgeIds.push(judgeId);
    else marks.push({ judgeId, score });
  }
  const complete = isValidPanelSize(judgeIds.length) && invalidJudgeIds.length === 0 && marks.length === judgeIds.length;
  return { marks: complete ? marks : null, filled, invalidJudgeIds };
}

export function isValidPanelSize(count: number): boolean {
  return count >= SPECIAL_DANCE_MIN_JUDGES && count <= SPECIAL_DANCE_MAX_JUDGES;
}

export type ParsedSpecialPoints = {
  // Every eligible participant's points, or null while any box is blank or
  // invalid. 0 is an explicit entry; blank is not.
  points: { coupleId: string; points: number }[] | null;
  filled: number;
  invalidCoupleIds: string[];
};

// The Points rows as typed, one box per eligible participant. Negative points
// are allowed (a penalty), in steps of 0.5.
export function parseSpecialPoints(inputs: Record<string, string>, coupleIds: string[]): ParsedSpecialPoints {
  const invalidCoupleIds: string[] = [];
  const points: { coupleId: string; points: number }[] = [];
  let filled = 0;
  for (const coupleId of coupleIds) {
    const raw = (inputs[coupleId] ?? "").trim();
    if (raw === "") continue;
    filled += 1;
    const value = Number(raw);
    if (!isValidPoints(value)) invalidCoupleIds.push(coupleId);
    else points.push({ coupleId, points: value });
  }
  const complete = coupleIds.length > 0 && invalidCoupleIds.length === 0 && points.length === coupleIds.length;
  return { points: complete ? points : null, filled, invalidCoupleIds };
}

export function teamMarksTotal(marks: TeamMark[]): number {
  return marks.reduce((sum, m) => sum + m.score, 0);
}

export function sameTeamMarks(a: TeamMark[] | null, b: TeamMark[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const byJudge = new Map(a.map((m) => [m.judgeId, m.score]));
  return b.every((m) => byJudge.get(m.judgeId) === m.score);
}

// Mirrors special_dance_complete(): a Marks dance has a mark from every judge
// on its panel; a Points dance has points for every eligible participant.
export function specialDanceComplete(
  dance: Pick<SpecialDance, "scoringMode" | "panelJudgeIds">,
  input: { marks: TeamMark[]; scores: SpecialDanceScore[]; eligibleCoupleIds: string[]; nightJudgeIds: string[] }
): boolean {
  if (dance.scoringMode === "points") {
    return (
      input.eligibleCoupleIds.length > 0 &&
      input.eligibleCoupleIds.every((coupleId) => input.scores.some((s) => s.coupleId === coupleId && s.points !== null))
    );
  }
  const panel = specialDancePanel(dance, input.nightJudgeIds);
  return isValidPanelSize(panel.length) && panel.every((judgeId) => input.marks.some((m) => m.judgeId === judgeId));
}

// The picker's status pill: how far along a special dance's scoring is.
export function specialDanceProgress(
  dance: Pick<SpecialDance, "scoringMode" | "panelJudgeIds" | "postedAt">,
  input: { marks: TeamMark[]; scores: SpecialDanceScore[]; eligibleCoupleIds: string[]; nightJudgeIds: string[] }
): { done: number; total: number; complete: boolean; label: string } {
  if (dance.scoringMode === "points") {
    const done = input.eligibleCoupleIds.filter((coupleId) => input.scores.some((s) => s.coupleId === coupleId && s.points !== null)).length;
    const total = input.eligibleCoupleIds.length;
    return { done, total, complete: specialDanceComplete(dance, input), label: dance.postedAt ? "Posted" : `${done} of ${total} points` };
  }
  const panel = specialDancePanel(dance, input.nightJudgeIds);
  const done = panel.filter((judgeId) => input.marks.some((m) => m.judgeId === judgeId)).length;
  return { done, total: panel.length, complete: specialDanceComplete(dance, input), label: dance.postedAt ? "Posted" : `${done} of ${panel.length} judges` };
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

// Eliminated on an earlier week, or eliminated with no week when we cannot
// tell. Same week stays pickable: they still danced tonight.
export function eliminatedBeforeWeek(
  couple: { status: string; eliminationWeek: number | null },
  weekNumber: number | null
): boolean {
  return (
    couple.status === "eliminated" &&
    (couple.eliminationWeek == null || weekNumber == null || couple.eliminationWeek < weekNumber)
  );
}

// The special's Add-participant list. Filtering is safe: eligibility already
// skips these couples, so adding one would only create a skipped row.
export function addableSpecialDanceParticipants<T extends { id: string; status: string; eliminationWeek: number | null }>(
  participants: T[],
  selectedIds: readonly string[],
  weekNumber: number | null
): T[] {
  return participants.filter((p) => !selectedIds.includes(p.id) && !eliminatedBeforeWeek(p, weekNumber));
}

// Mirrors team_eligible_members(): on the team, in tonight's cast, not
// withdrawn, Did Not Dance, or eliminated before this week. Shared by the
// publication and team-post planners and by the team entry's member list.
export function eligibleTeamMembers(
  team: Pick<SpecialDance, "memberCoupleIds">,
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
    else if (eliminatedBeforeWeek(member, opts.weekNumber)) skipped.push({ coupleId, reason: "eliminated" });
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
  return isValidPanelSize(marks.length) ? marks : null;
}

// Client-side preview of what the inferred fallback does for each member
// (marks written into the team row of every member's draft). The draft save
// is authoritative; this keeps the "Applies to N of M" list honest before
// and after the call.
export function teamApplyPlan(
  team: SpecialDance,
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
    if (eliminatedBeforeWeek(member, opts.weekNumber))
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

// One dance of a couple's night, as the Leaderboard view knows it: the
// couple's own dance (label null), a special dance scored by marks, or a
// bonus round scored in points (marks empty, points set).
export type NightSummaryDance = {
  marks: number[];
  markMax?: number;
  points?: number | null;
  // The special dance's name for a marks row, its Dance Type for a points
  // row; null for the couple's own dance.
  label: string | null;
};

export type NightSummaryRow = {
  coupleId: string;
  individualTotal: number;
  // Special dances the couple took part in: marks parts carry their total,
  // bonus parts their points.
  parts: { label: string; total: number; bonus: boolean }[];
  nightTotal: number;
  marksTotal: number;
  bonusTotal: number;
  maxPossible: number;
  // The night on the 30-point basis Dance Card pays on, through the engine's
  // own collapse. Preview only; nothing stores it.
  danceCardPreview: number;
  tag: "top" | "within1" | "within2" | null;
};

// One dance as the engine sees it: marks on their own scale, or points as a
// 0-max row. Shared with the per-couple night preview on Enter Results.
export function nightSummaryDanceScore(episodeId: string, coupleId: string, dance: NightSummaryDance) {
  if (dance.points != null) return { episodeId, coupleId, totalScore: dance.points, scaledScore: 0, maxScore: 0 };
  const markMax = dance.markMax ?? DEFAULT_MARK_MAX;
  const totalScore = dance.marks.reduce((sum, n) => sum + n, 0);
  return { episodeId, coupleId, totalScore, scaledScore: scaledJudgesScore(dance.marks, markMax), maxScore: dance.marks.length * markMax };
}

// Frame 08: Individual + Team + Dance-Off = Night out of the marks possible,
// Dance Card out of 30 (above it when bonus points were earned), with
// Curtain Call's raw-total bands. Ties at the top all read Top Scorer.
export function buildNightSummary(
  couples: { coupleId: string; dances: NightSummaryDance[] }[]
): NightSummaryRow[] {
  const rows = couples
    .filter((c) => c.dances.some((d) => d.marks.length > 0 || d.points != null))
    .map((c) => {
      const scored = c.dances.filter((d) => d.marks.length > 0 || d.points != null);
      const [night] = collapseToNights(scored.map((d) => nightSummaryDanceScore("", c.coupleId, d)));
      const totalOf = (d: NightSummaryDance) => d.points ?? d.marks.reduce((sum, n) => sum + n, 0);
      return {
        coupleId: c.coupleId,
        individualTotal: scored.reduce((sum, d) => sum + (d.label ? 0 : totalOf(d)), 0),
        parts: scored.flatMap((d) => (d.label ? [{ label: d.label, total: totalOf(d), bonus: d.points != null }] : [])),
        nightTotal: night.totalScore,
        marksTotal: night.totalScore - night.bonusScore,
        bonusTotal: night.bonusScore,
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

export type SpecialDanceSetupInput = {
  id: string | null;
  danceType: string;
  name: string;
  memberCoupleIds: string[];
  danceStyleId: string | null;
  secondDanceStyleId: string | null;
  songs: SpecialDanceSong[];
  scoringMode: SpecialDanceScoringMode;
  songSource: string | null;
  themeLabel: string | null;
  details: SpecialDanceDetail[];
  sortOrder: number;
};

// Client-side mirror of save_special_dance's checks so the inline editor can
// explain a problem before the round trip. The RPC still enforces every rule.
export function validateSpecialDanceSetup(
  input: SpecialDanceSetupInput,
  others: Pick<SpecialDance, "id" | "name">[]
): string | null {
  const danceType = input.danceType.trim();
  if (!danceType) return "Pick or type a Dance Type.";
  if (danceType.length > 40) return "Dance Type is limited to 40 characters.";
  if (new Set(input.memberCoupleIds).size < 1) return "Add at least one participant.";
  const name = input.name.trim();
  if (name && others.some((o) => o.id !== input.id && o.name.trim().toLowerCase() === name.toLowerCase()))
    return `Another special dance is already called "${name}".`;
  if (input.songs.length > SPECIAL_DANCE_MAX_SONGS) return `A special dance can list up to ${SPECIAL_DANCE_MAX_SONGS} songs.`;
  if (input.details.length > SPECIAL_DANCE_MAX_DETAILS) return `A special dance can carry up to ${SPECIAL_DANCE_MAX_DETAILS} extra details.`;
  if (input.details.some((d) => !d.label.trim())) return "Every extra detail needs a label.";
  return null;
}

// Blank Team Name gives "Dance Type N", counting that type's entries on the
// night (mirrors save_special_dance).
export function automaticSpecialDanceName(danceType: string, others: Pick<SpecialDance, "id" | "danceType" | "name">[], ownId: string | null): string {
  const type = danceType.trim();
  const taken = new Set(others.filter((o) => o.id !== ownId).map((o) => o.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? type : `${type} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Recently used Dance Types and detail labels across the season's entries,
// newest first, compared without regard to case. Built-ins come first.
// "Tatyana, Maura, Amber, and Julia" — the picker's member line.
export function oxfordJoin(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export const SKIP_LABEL: Record<SkipReason, string> = {
  withdrawn: "Withdrawn · Skipped",
  bye: "Did Not Dance · Skipped",
  eliminated: "Eliminated · Skipped",
  not_performing: "Not Performing · Skipped",
};

export function recentSuggestions(builtIn: readonly string[], used: { value: string; updatedAt: string | null }[]): string[] {
  const seen = new Set(builtIn.map((v) => v.toLowerCase()));
  const result = [...builtIn];
  for (const { value } of [...used].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }
  return result;
}

// Read-state summary: `Freestyle · "Zoo" · Zootopia 2 · Host Alfonso Ribeiro`.
export function specialDanceSummary(
  dance: Pick<SpecialDance, "songs" | "songSource" | "details" | "danceStyleId" | "secondDanceStyleId">,
  styleNames: ReadonlyMap<string, string>
): string {
  const parts: string[] = [];
  const style = styleNames.get(dance.danceStyleId);
  const second = dance.secondDanceStyleId ? styleNames.get(dance.secondDanceStyleId) : null;
  if (style) parts.push(second ? `${style} & ${second}` : style);
  for (const song of dance.songs) parts.push(song.artist ? `"${song.title}" by ${song.artist}` : `"${song.title}"`);
  if (dance.songSource) parts.push(dance.songSource);
  for (const detail of dance.details) if (detail.value.trim()) parts.push(`${detail.label} ${detail.value}`);
  return parts.join(" · ");
}
