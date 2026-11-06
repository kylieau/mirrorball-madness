import { roundPoints } from "./format-points";
import { isValidMark } from "./judge-marks";
import { collapseToNights, MARK_MAX, scaledJudgesScore } from "./scoring";

// A special dance takes marks from the night's judges: the standing panel plus
// that episode's guests, 2 to 4 of them, each out of 10. The SQL checks the
// same bounds (save_team_marks).
export const SPECIAL_DANCE_MIN_JUDGES = 2;
export const SPECIAL_DANCE_MAX_JUDGES = 4;
export const SPECIAL_DANCE_MAX_SONGS = 4;
export const SPECIAL_DANCE_MAX_DETAILS = 12;
export const SPECIAL_DANCE_POINTS_LIMIT = 100;
export const DEFAULT_DANCE_TYPE = "Team Dance";

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
// The details that recur across special dances: who picked a team, a host or
// live act joining it, and a mentor coaching it.
export const DETAIL_LABEL_SUGGESTIONS = ["Captain", "Host", "Live Performer", "Mentor"] as const;
// Placings are left out: marathon couples share tiers, and the points already
// order them.
export const RESULT_SUGGESTIONS = ["Winner", "Loser", "Immune"] as const;

// "marks": one shared set of marks; "couple_marks": each participant's own
// marks (a heat judged couple by couple); "points": points per couple.
export type SpecialDanceScoringMode = "marks" | "couple_marks" | "points";
export type SpecialDanceSong = { title: string };
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
  danceStyleId: string;
  secondDanceStyleId: string | null;
  songs: SpecialDanceSong[];
  // Mirror of songs[0].title, kept for older readers.
  songTitle: string | null;
  details: SpecialDanceDetail[];
  // Mirrors of the Captain and Host details, kept for older readers.
  captainCoupleId: string | null;
  hostName: string | null;
  sortOrder: number;
  memberCoupleIds: string[];
  // Its round and heat (or team) number in the episode's plan; a round's
  // immunity bonus has a round and no heat. Null for a dance outside the plan.
  roundId: string | null;
  heatNumber: number | null;
  // When the dance's score went live (entity model), else null.
  postedAt: string | null;
  updatedAt: string | null;
};

export type TeamMark = { judgeId: string; score: number };
// A couple-by-couple dance's saved marks, per participant.
export type CoupleMarks = Record<string, TeamMark[]>;
// A participant's draft points and result in a Points-mode special dance
// (episode_team_scores, service-only until posted).
export type SpecialDanceScore = { coupleId: string; points: number | null; result: string | null };

export function isHalfStep(value: number): boolean {
  return Number.isFinite(value) && value * 2 === Math.trunc(value * 2);
}

export function isValidPoints(points: number): boolean {
  return isHalfStep(points) && Math.abs(points) <= SPECIAL_DANCE_POINTS_LIMIT;
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
  "nameIsAuto" | "danceType" | "scoringMode" | "secondDanceStyleId" | "songs" | "details" | "updatedAt"
> {
  const details: SpecialDanceDetail[] = [];
  if (team.captainCoupleId) details.push({ label: "Captain", value: team.captainName ?? "", coupleId: team.captainCoupleId });
  if (team.hostName) details.push({ label: "Host", value: team.hostName, coupleId: null });
  return {
    nameIsAuto: false,
    danceType: DEFAULT_DANCE_TYPE,
    scoringMode: "marks",
    secondDanceStyleId: null,
    songs: team.songTitle ? [{ title: team.songTitle }] : [],
    details,
    updatedAt: null,
  };
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

type ScoringInput = {
  marks: TeamMark[];
  coupleMarks?: CoupleMarks;
  scores: SpecialDanceScore[];
  eligibleCoupleIds: string[];
  nightJudgeIds: string[];
};

function coupleMarksDone(input: ScoringInput): number {
  return input.eligibleCoupleIds.reduce(
    (sum, coupleId) => sum + input.nightJudgeIds.filter((j) => (input.coupleMarks?.[coupleId] ?? []).some((m) => m.judgeId === j)).length,
    0
  );
}

// Mirrors special_dance_complete(): a Marks dance has a mark from every one of
// the night's judges; a couple-by-couple dance has that for every eligible
// participant; a Points dance has points for every eligible participant.
export function specialDanceComplete(dance: Pick<SpecialDance, "scoringMode">, input: ScoringInput): boolean {
  if (dance.scoringMode === "couple_marks") {
    return (
      isValidPanelSize(input.nightJudgeIds.length) &&
      input.eligibleCoupleIds.length > 0 &&
      coupleMarksDone(input) === input.eligibleCoupleIds.length * input.nightJudgeIds.length
    );
  }
  if (dance.scoringMode === "points") {
    return (
      input.eligibleCoupleIds.length > 0 &&
      input.eligibleCoupleIds.every((coupleId) => input.scores.some((s) => s.coupleId === coupleId && s.points !== null))
    );
  }
  const judgeIds = input.nightJudgeIds;
  return isValidPanelSize(judgeIds.length) && judgeIds.every((judgeId) => input.marks.some((m) => m.judgeId === judgeId));
}

// The picker's status pill: how far along a special dance's scoring is.
export function specialDanceProgress(
  dance: Pick<SpecialDance, "scoringMode" | "postedAt">,
  input: ScoringInput
): { done: number; total: number; complete: boolean; label: string } {
  if (dance.scoringMode === "couple_marks") {
    const done = coupleMarksDone(input);
    const total = input.eligibleCoupleIds.length * input.nightJudgeIds.length;
    return { done, total, complete: specialDanceComplete(dance, input), label: dance.postedAt ? "Posted" : `${done} of ${total} marks` };
  }
  if (dance.scoringMode === "points") {
    const done = input.eligibleCoupleIds.filter((coupleId) => input.scores.some((s) => s.coupleId === coupleId && s.points !== null)).length;
    const total = input.eligibleCoupleIds.length;
    return { done, total, complete: specialDanceComplete(dance, input), label: dance.postedAt ? "Posted" : `${done} of ${total} points` };
  }
  const judgeIds = input.nightJudgeIds;
  const done = judgeIds.filter((judgeId) => input.marks.some((m) => m.judgeId === judgeId)).length;
  return { done, total: judgeIds.length, complete: specialDanceComplete(dance, input), label: dance.postedAt ? "Posted" : `${done} of ${judgeIds.length} judges` };
}

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
// publication and team-post planners and by the special dance's member list.
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

// One dance of a couple's night, as the Leaderboard view knows it: the
// couple's own dance (label null), a special dance scored by marks, or a
// bonus round scored in points (marks empty, points set).
export type NightSummaryDance = {
  marks: number[];
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

// A part of a Night Summary as it reads after its name: marks plain ("36"),
// a bonus always signed ("+3", "+0", "−1.5") so a heat's number and a
// loser's 0 can't run together ("Dance-Off 1 +0", never "Dance-Off 1 0").
export function nightPartScore(part: { total: number; bonus: boolean }): string {
  if (!part.bonus) return String(part.total);
  return part.total < 0 ? `−${-part.total}` : `+${part.total}`;
}

// One dance as the engine sees it: marks on their own scale, or points as a
// 0-max row. Shared with the per-couple night preview on Enter Results.
export function nightSummaryDanceScore(episodeId: string, coupleId: string, dance: NightSummaryDance) {
  if (dance.points != null) return { episodeId, coupleId, totalScore: dance.points, scaledScore: 0, maxScore: 0 };
  const totalScore = dance.marks.reduce((sum, n) => sum + n, 0);
  return { episodeId, coupleId, totalScore, scaledScore: scaledJudgesScore(dance.marks, MARK_MAX), maxScore: dance.marks.length * MARK_MAX };
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
  details: SpecialDanceDetail[];
  sortOrder: number;
  // Kept as they are, so saving a heat's setup never moves it out of its round.
  roundId: string | null;
  heatNumber: number | null;
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

// Read-state summary: `Freestyle · "Zoo (Zootopia 2)" · Host Alfonso Ribeiro`.
// A song's source rides in its title, as on couples' songs.
export function specialDanceSummary(
  dance: Pick<SpecialDance, "songs" | "details" | "danceStyleId" | "secondDanceStyleId">,
  styleNames: ReadonlyMap<string, string>
): string {
  const parts: string[] = [];
  const style = styleNames.get(dance.danceStyleId);
  const second = dance.secondDanceStyleId ? styleNames.get(dance.secondDanceStyleId) : null;
  if (style) parts.push(second ? `${style} & ${second}` : style);
  for (const song of dance.songs) parts.push(`"${song.title}"`);
  for (const detail of dance.details) if (detail.value.trim()) parts.push(`${detail.label} ${detail.value}`);
  return parts.join(" · ");
}
