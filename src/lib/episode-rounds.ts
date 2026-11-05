import { oxfordJoin, type SpecialDance, type SpecialDanceScoringMode } from "./team-dances";

// An episode's planned rounds (episode_rounds, supabase/apply-episode-rounds.sql).
// Round 1 is always the couples' own Individual Dance. "own" rounds are one
// more dance per couple (the draft rows map to them in order, as
// expected_dance_count did); "special" rounds hold heats or teams as special
// dances; "none" rounds only decide an elimination and never score.
export type RoundKind = "own" | "special" | "none";
export type RoundScoring = "marks" | "couple_marks" | "fixed_bonus" | "ranked_points" | "team_marks" | "none";
export type SpecialRoundScoring = Extract<RoundScoring, "couple_marks" | "fixed_bonus" | "ranked_points" | "team_marks">;
export type ExceptionKind = "immune" | "not_dancing" | "withdrawn";

export type EpisodeRound = {
  id: string;
  episodeId: string;
  position: number;
  kind: RoundKind;
  roundType: string;
  scoring: RoundScoring;
  bonusPoints: number | null;
  unitCount: number;
};

export type RoundException = {
  roundId: string;
  coupleId: string;
  kind: ExceptionKind;
  note: string | null;
  bonusPoints: number | null;
};

export const INDIVIDUAL_DANCE = "Individual Dance";
export const MAX_ROUNDS = 12;
export const MAX_UNITS = 12;
export const IMMUNITY_DANCE_TYPE = "Immunity";

export type RoundOption = { roundType: string; kind: RoundKind; description: string; scoring: RoundScoring; unitCount: number };

// The Add Round picker: couples' own dances first, then special dances, then
// rounds that only decide an elimination.
export const OWN_ROUND_OPTIONS: RoundOption[] = [
  { roundType: "Second Dance", kind: "own", description: "A new style and song for each couple", scoring: "marks", unitCount: 0 },
  { roundType: "Instant Dance", kind: "own", description: "Style and song revealed on the night", scoring: "marks", unitCount: 0 },
  { roundType: "Judges' Choice", kind: "own", description: "Judges pick the style", scoring: "marks", unitCount: 0 },
  { roundType: "Redemption Dance", kind: "own", description: "A style a couple danced before", scoring: "marks", unitCount: 0 },
  { roundType: "Trio Dance", kind: "own", description: "Each couple plus a pro or guest", scoring: "marks", unitCount: 0 },
];
export const SPECIAL_ROUND_OPTIONS: RoundOption[] = [
  { roundType: "Dance-Off", kind: "special", description: "Head-to-heads. Set heats and pairings", scoring: "fixed_bonus", unitCount: 3 },
  { roundType: "Team Dance", kind: "special", description: "Teams of couples. Marks typed once per team", scoring: "team_marks", unitCount: 2 },
  { roundType: "Marathon", kind: "special", description: "Everyone on the floor; points by finish", scoring: "ranked_points", unitCount: 1 },
  { roundType: "Relay", kind: "special", description: "Couples hand off; points or a winner's bonus", scoring: "fixed_bonus", unitCount: 1 },
  { roundType: "Challenge", kind: "special", description: "A one-off bonus round", scoring: "fixed_bonus", unitCount: 1 },
];
export const ELIMINATION_ROUND_OPTIONS: RoundOption[] = [
  { roundType: "Judges' Save", kind: "none", description: "Bottom two dance again; no points", scoring: "none", unitCount: 0 },
  { roundType: "Bottom-Two Dance-Off", kind: "none", description: "Decides the elimination; no points", scoring: "none", unitCount: 0 },
];

export const SPECIAL_SCORING_OPTIONS: { scoring: SpecialRoundScoring; label: string; help: string }[] = [
  { scoring: "fixed_bonus", label: "Winner's Bonus", help: "Pick Winner and Loser on Enter Results. The winner gets the bonus, the loser 0." },
  { scoring: "couple_marks", label: "Judges' Marks", help: "Each couple gets their own marks, 1 to 10 per judge." },
  { scoring: "ranked_points", label: "Points by Finish", help: "Type each couple's points by where they finish." },
  { scoring: "team_marks", label: "Team Score", help: "One set of marks, shared by every couple in the team." },
];

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  immune: "Immune",
  not_dancing: "Not Dancing",
  withdrawn: "Withdrawn",
};

// What a special round's heats are stored as (round_special_mode in SQL).
export function specialModeFor(scoring: RoundScoring): SpecialDanceScoringMode {
  if (scoring === "couple_marks") return "couple_marks";
  if (scoring === "team_marks") return "marks";
  return "points";
}

// "Dance-Off 1" when a round has several heats, the bare type when it has one
// (round_heat_name in SQL).
export function heatName(roundType: string, heatNumber: number, unitCount: number): string {
  return unitCount > 1 ? `${roundType.trim()} ${heatNumber}` : roundType.trim();
}

// "Heats" for a dance-off, "Teams" for a team dance, else "Groups".
export function unitNoun(round: Pick<EpisodeRound, "roundType" | "scoring">, plural = true): string {
  if (round.scoring === "team_marks") return plural ? "Teams" : "Team";
  if (/dance-?off/i.test(round.roundType)) return plural ? "Heats" : "Heat";
  return plural ? "Groups" : "Group";
}

// Which of a couple's own dances a round is: 0 for Round 1, 1 for the next
// own round, and so on. -1 for a special or elimination round.
export function ownSlotIndex(rounds: EpisodeRound[], roundId: string): number {
  const own = rounds.filter((r) => r.kind === "own").sort((a, b) => a.position - b.position);
  return own.findIndex((r) => r.id === roundId);
}

export function roundTabLabel(round: Pick<EpisodeRound, "position" | "roundType">): string {
  return `${round.position} · ${round.roundType === INDIVIDUAL_DANCE ? "Individual" : round.roundType}`;
}

export type RoundUnit = { heatNumber: number; name: string; dance: SpecialDance | null };

// A special round's heats or teams in order, one per planned number, with a
// placeholder (dance null) where none is set up yet. A heat numbered past the
// plan still shows, so nothing saved is hidden.
export function roundUnits(round: EpisodeRound, dances: SpecialDance[]): RoundUnit[] {
  const mine = dances.filter((d) => d.roundId === round.id && d.heatNumber != null);
  const count = Math.max(round.unitCount, ...mine.map((d) => d.heatNumber ?? 0));
  return Array.from({ length: count }, (_, i) => {
    const dance = mine.find((d) => d.heatNumber === i + 1) ?? null;
    return { heatNumber: i + 1, name: dance?.name ?? heatName(round.roundType, i + 1, round.unitCount), dance };
  });
}

// A round's immunity bonus dance (the one with a round and no heat).
export function roundImmunity(round: Pick<EpisodeRound, "id">, dances: SpecialDance[]): SpecialDance | null {
  return dances.find((d) => d.roundId === round.id && d.heatNumber == null) ?? null;
}

export function exceptionsFor(roundId: string, exceptions: RoundException[]): RoundException[] {
  return exceptions.filter((x) => x.roundId === roundId);
}

// 'withdrawn' while any round has the couple Withdrawn, 'bye' while every
// round has them Not Dancing, else null (couple_night_exception in SQL).
export function nightException(rounds: Pick<EpisodeRound, "id">[], exceptions: RoundException[], coupleId: string): "withdrawn" | "bye" | null {
  const mine = exceptions.filter((x) => x.coupleId === coupleId);
  if (mine.some((x) => x.kind === "withdrawn")) return "withdrawn";
  if (rounds.length > 0 && rounds.every((r) => mine.some((x) => x.roundId === r.id && x.kind === "not_dancing"))) return "bye";
  return null;
}

// The rounds an exception covers: Withdrawn is always the whole night.
export function exceptionRoundIds(rounds: Pick<EpisodeRound, "id">[], kind: ExceptionKind | null, chosen: string[]): string[] {
  return kind === "withdrawn" ? rounds.map((r) => r.id) : chosen;
}

// The exceptions after marking (kind set) or clearing (kind null) one couple
// in some rounds, as the SQL leaves them. Clearing a Withdrawn clears it
// everywhere.
export function exceptionsAfter(
  rounds: Pick<EpisodeRound, "id">[],
  exceptions: RoundException[],
  change: { coupleId: string; roundIds: string[]; kind: ExceptionKind | null; note?: string | null; bonusPoints?: number | null }
): RoundException[] {
  const clearingWithdrawn =
    change.kind === null &&
    exceptions.some((x) => x.coupleId === change.coupleId && x.kind === "withdrawn" && change.roundIds.includes(x.roundId));
  const roundIds = clearingWithdrawn ? rounds.map((r) => r.id) : exceptionRoundIds(rounds, change.kind, change.roundIds);
  const kept = exceptions.filter((x) => !(x.coupleId === change.coupleId && roundIds.includes(x.roundId)));
  if (change.kind === null) return kept;
  const kind = change.kind;
  return [
    ...kept,
    ...roundIds.map((roundId) => ({
      roundId,
      coupleId: change.coupleId,
      kind,
      note: change.note?.trim() || null,
      bonusPoints: kind === "immune" ? (change.bonusPoints ?? null) : null,
    })),
  ];
}

// The couple's draft outcome and Immunity box after an exception change, the
// same way apply_round_exception writes them, so the page's own autosave
// never sends back what the server just replaced.
export function rowAfterException(
  row: { outcome: string; hadImmunity: boolean },
  rounds: Pick<EpisodeRound, "id">[],
  before: RoundException[],
  after: RoundException[],
  coupleId: string,
  kind: ExceptionKind | null
): { outcome: string; hadImmunity: boolean } {
  const nightBefore = nightException(rounds, before, coupleId);
  const nightAfter = nightException(rounds, after, coupleId);
  const immuneBefore = before.some((x) => x.coupleId === coupleId && x.kind === "immune");
  const immuneAfter = after.some((x) => x.coupleId === coupleId && x.kind === "immune");
  const outcome = nightAfter ?? (nightBefore && row.outcome === nightBefore ? "safe" : row.outcome);
  const hadImmunity = immuneAfter !== immuneBefore || kind === "immune" ? immuneAfter : row.hadImmunity;
  return { outcome, hadImmunity };
}

// What an exception does, said before it is saved.
export function exceptionStatus(input: {
  kind: ExceptionKind;
  coupleName: string;
  roundNames: string[];
  wholeNight: boolean;
  bonus: number | null;
}): string {
  const where = input.wholeNight ? "Every round tonight" : oxfordJoin(input.roundNames);
  if (input.kind === "withdrawn")
    return `${input.coupleName} sit out every round tonight. Their outcome saves as Withdrawn.`;
  if (input.kind === "immune")
    return `${where} skips ${input.coupleName}. ${
      input.bonus != null ? `They get the ${input.bonus}-point bonus.` : "They get the round's winner's bonus once it is set."
    }`;
  return input.wholeNight
    ? `${where}: ${input.coupleName} sit out. Their outcome saves as Did Not Dance: still in the cast, no survival bonus.`
    : `${where} skips ${input.coupleName}. They stay in the competition.`;
}

export type PairingCheck = { tone: "danger" | "warn" | "muted" | "ok"; message: string };

// Checks for a special round's pairings on Edit Episode. They warn and never
// block a save: the night can change on air.
export function pairingChecks(input: {
  round: Pick<EpisodeRound, "roundType" | "scoring">;
  units: string[][];
  exceptions: Pick<RoundException, "coupleId" | "kind">[];
  castIds: string[];
  name: (coupleId: string) => string;
}): PairingCheck[] {
  const placed = input.units.flat();
  if (placed.length === 0) {
    return [{ tone: "muted", message: "No pairings yet. That's fine: set them here or on Enter Results when they're announced." }];
  }
  const checks: PairingCheck[] = [];
  const noun = unitNoun(input.round, false).toLowerCase();
  for (const coupleId of new Set(placed)) {
    const where = input.units.flatMap((unit, i) => (unit.includes(coupleId) ? [heatName(input.round.roundType, i + 1, input.units.length)] : []));
    if (where.length > 1)
      checks.push({ tone: "danger", message: `${input.name(coupleId)} is in ${oxfordJoin(where)}. A couple can be in one ${noun}.` });
    if (input.exceptions.some((x) => x.coupleId === coupleId))
      checks.push({ tone: "danger", message: `${input.name(coupleId)} is marked out of this round and also in a ${noun}.` });
  }
  const unplaced = input.castIds.filter((id) => !placed.includes(id) && !input.exceptions.some((x) => x.coupleId === id));
  for (const coupleId of unplaced)
    checks.push({ tone: "warn", message: `${input.name(coupleId)} isn't in a ${noun} yet. Pair them, or mark an exception.` });
  if (checks.length === 0) {
    const immune = input.exceptions.filter((x) => x.kind === "immune").map((x) => input.name(x.coupleId));
    const filled = input.units.filter((u) => u.length > 0).length;
    checks.push({
      tone: "ok",
      message: `Everyone is placed: ${new Set(placed).size} couples in ${filled} ${filled === 1 ? noun : `${noun}s`}${
        immune.length > 0 ? `, and ${oxfordJoin(immune)} ${immune.length === 1 && !immune[0].includes("&") ? "is" : "are"} Immune` : ""
      }.`,
    });
  }
  return checks;
}

// One round as Edit Episode holds it before Save.
export type RoundDraft = {
  key: string;
  id: string | null;
  kind: RoundKind;
  roundType: string;
  scoring: RoundScoring;
  bonusPoints: number | null;
  unitCount: number;
  // Couples per heat, or null where Edit Episode doesn't set members (team
  // rounds: teams are set up on Enter Results).
  units: string[][] | null;
  exceptions: Omit<RoundException, "roundId">[];
};

export function roundDraftFrom(round: EpisodeRound, dances: SpecialDance[], exceptions: RoundException[]): RoundDraft {
  return {
    key: round.id,
    id: round.id,
    kind: round.kind,
    roundType: round.roundType,
    scoring: round.scoring,
    bonusPoints: round.bonusPoints,
    unitCount: round.unitCount,
    units: round.kind === "special" && round.scoring !== "team_marks"
      ? roundUnits(round, dances).map((u) => u.dance?.memberCoupleIds ?? [])
      : null,
    exceptions: exceptionsFor(round.id, exceptions).map(({ coupleId, kind, note, bonusPoints }) => ({ coupleId, kind, note, bonusPoints })),
  };
}

export function newRoundDraft(option: RoundOption, key: string): RoundDraft {
  return {
    key,
    id: null,
    kind: option.kind,
    roundType: option.roundType,
    scoring: option.scoring,
    bonusPoints: null,
    unitCount: option.unitCount,
    units: option.kind === "special" && option.scoring !== "team_marks" ? Array.from({ length: option.unitCount }, () => []) : null,
    exceptions: [],
  };
}

export function individualRoundDraft(key = "round-1"): RoundDraft {
  return { key, id: null, kind: "own", roundType: INDIVIDUAL_DANCE, scoring: "marks", bonusPoints: null, unitCount: 0, units: null, exceptions: [] };
}

// A round's heats resized: extra heats are dropped, new ones start empty.
export function resizeUnits(draft: RoundDraft, unitCount: number): RoundDraft {
  const count = Math.min(Math.max(unitCount, 1), MAX_UNITS);
  return {
    ...draft,
    unitCount: count,
    units: draft.units ? Array.from({ length: count }, (_, i) => draft.units![i] ?? []) : null,
  };
}

// Problems Save would hit, said before the round trip. The RPC still checks.
export function validateRounds(drafts: RoundDraft[]): string | null {
  if (drafts.length === 0 || drafts[0].kind !== "own" || drafts[0].roundType !== INDIVIDUAL_DANCE) return "Round 1 is always the Individual Dance.";
  if (drafts.length > MAX_ROUNDS) return `An episode can have up to ${MAX_ROUNDS} rounds.`;
  for (const [i, d] of drafts.entries()) {
    const type = d.roundType.trim();
    if (!type || type.length > 40) return `Round ${i + 1} needs a name of 1 to 40 characters.`;
    if (d.kind === "special" && (d.unitCount < 1 || d.unitCount > MAX_UNITS)) return `${type} can have 1 to ${MAX_UNITS} heats or teams.`;
    if (d.bonusPoints != null && (Math.abs(d.bonusPoints) > 100 || d.bonusPoints * 2 !== Math.trunc(d.bonusPoints * 2)))
      return `${type}'s bonus is between −100 and 100 in steps of 0.5.`;
  }
  return null;
}

// The save_episode_rounds payload. Team rounds send no members; exceptions are
// sent per round (Withdrawn already in every round).
export function roundsPayload(drafts: RoundDraft[]) {
  return drafts.map((d) => ({
    id: d.id,
    kind: d.kind,
    roundType: d.roundType.trim(),
    scoring: d.scoring,
    bonusPoints: d.scoring === "fixed_bonus" ? d.bonusPoints : null,
    unitCount: d.kind === "special" ? d.unitCount : 0,
    ...(d.units ? { heats: d.units.map((coupleIds, i) => ({ heatNumber: i + 1, coupleIds })) } : {}),
    exceptions: d.exceptions.map((x) => ({ coupleId: x.coupleId, kind: x.kind, note: x.note, bonusPoints: x.kind === "immune" ? x.bonusPoints : null })),
  }));
}

// Marks or clears one couple on a draft plan. Withdrawn spans every round.
export function draftsWithException(
  drafts: RoundDraft[],
  roundKey: string,
  coupleId: string,
  exception: Omit<RoundException, "roundId" | "coupleId"> | null
): RoundDraft[] {
  const withdrawnNow = drafts.some((d) => d.key === roundKey && d.exceptions.some((x) => x.coupleId === coupleId && x.kind === "withdrawn"));
  const everyRound = exception?.kind === "withdrawn" || (exception === null && withdrawnNow);
  return drafts.map((d) => {
    if (!everyRound && d.key !== roundKey) return d;
    const kept = d.exceptions.filter((x) => x.coupleId !== coupleId);
    const units = d.units?.map((u) => (exception ? u.filter((id) => id !== coupleId) : u)) ?? null;
    if (!exception) return { ...d, exceptions: kept };
    if (exception.kind === "immune" && d.kind !== "special") return { ...d, exceptions: kept, units };
    return { ...d, units, exceptions: [...kept, { coupleId, ...exception }] };
  });
}
