import { NO_SURVIVAL_OUTCOMES, nightScaledScoresByCouple, type DanceScore, type Outcome } from "./scoring";

// Dance Card v2 (docs/design/dance-card-v2/): a couple's season value is
// k × S^p, where S is its weekly inputs summed from the league's Anchor
// Week, and each week pays whoever holds the couple the change in that
// value. The version string pins the exponent and the coefficient table; a
// refit is a new version, never an edit to these numbers.
export const DANCE_CARD_V2_EXPONENT = 0.8;

// k by roster size, solved on the strong-play schedule model
// (solveDanceCardV2Coefficients in strong-play-ceilings.ts, pinned by a test).
export const DANCE_CARD_V2_COEFFICIENTS: Record<number, number> = {
  1: 1.7309,
  2: 0.8884,
  3: 0.6117,
  4: 0.4589,
  5: 0.3217,
  6: 0.3061,
};

// Dance Card v3 (docs/design/dance-card-v3/, Kylie 2026-11-10): one judges'
// rate all season, survival tapering as 3.00 × √(survival weeks), the Fantasy
// Bonus at face value, no placement. Rates by roster size are pinned to
// solveDanceCardV3Rates(3, 0.5).
export const DANCE_CARD_V3_SURVIVAL_FIRST = 3;
export const DANCE_CARD_V3_SURVIVAL_EXPONENT = 0.5;
export const DANCE_CARD_V3_RATES: Record<number, number> = {
  1: 0.5832,
  2: 0.2731,
  3: 0.1755,
  4: 0.1212,
  5: 0.0717,
  6: 0.0676,
};

export type DanceCardRule =
  | { version: "v1" }
  | { version: "v2"; exponent: number; coefficient: number }
  | { version: "v3"; rate: number; survivalFirst: number; survivalExponent: number };

export type DanceCardV2Rule = Extract<DanceCardRule, { version: "v2" }>;
export type DanceCardV3Rule = Extract<DanceCardRule, { version: "v3" }>;
// v2 and v3 both pay week by week from a couple's history since the Anchor
// Week, through danceCardLedger.
export type DanceCardLedgerRule = DanceCardV2Rule | DanceCardV3Rule;

export function usesDanceCardLedger(version: string | null | undefined): boolean {
  return version === "v2" || version === "v3";
}

// The model can't seat rosters past six (12 couples, two managers), so a
// larger roster scales the two-couple k by 2/N, which matches the model
// within 3% where both exist.
function forRoster(table: Record<number, number>, rosterSize: number): number {
  return table[rosterSize] ?? Math.round(((table[2] * 2) / Math.max(1, rosterSize)) * 10000) / 10000;
}

export function danceCardV2Rule(rosterSize: number): DanceCardV2Rule {
  return { version: "v2", exponent: DANCE_CARD_V2_EXPONENT, coefficient: forRoster(DANCE_CARD_V2_COEFFICIENTS, rosterSize) };
}

export function danceCardV3Rule(rosterSize: number): DanceCardV3Rule {
  return {
    version: "v3",
    rate: forRoster(DANCE_CARD_V3_RATES, rosterSize),
    survivalFirst: DANCE_CARD_V3_SURVIVAL_FIRST,
    survivalExponent: DANCE_CARD_V3_SURVIVAL_EXPONENT,
  };
}

export function danceCardLedgerRule(version: string | null | undefined, rosterSize: number): DanceCardLedgerRule | null {
  if (version === "v2") return danceCardV2Rule(rosterSize);
  if (version === "v3") return danceCardV3Rule(rosterSize);
  return null;
}

export function danceCardRule(
  settings: { dance_card_version?: string | null },
  rosterSize: number
): DanceCardRule {
  return danceCardLedgerRule(settings.dance_card_version, rosterSize) ?? { version: "v1" };
}

export function coupleValueCents(cumulative: number, rule: DanceCardV2Rule): number {
  if (!(cumulative > 0)) return 0;
  return Math.round(rule.coefficient * cumulative ** rule.exponent * 100);
}

export type DanceCardWeek = {
  weekNumber: number;
  danceScores: DanceScore[];
  // Settled outcomes only. Under v2 a Fantasy Bonus joins the week's input
  // like a bonus-round dance; under v3 it pays at face value, and the outcome
  // decides survival, so v3 needs it on every row.
  outcomes?: { coupleId: string; bonusPoints: number; outcome?: string }[];
};

// input is the week's judges input (v2: with the Fantasy Bonus inside).
// creditCents is the whole week; under v3 survivalCents and bonusCents are
// the parts of it that aren't judges.
export type DanceCardLedgerEntry = {
  input: number;
  cumulative: number;
  valueCents: number;
  creditCents: number;
  survivalCents: number;
  bonusCents: number;
};

export type DanceCardLedger = Map<string, Map<number, DanceCardLedgerEntry>>;

// The only place S and V are computed. Inputs are summed in ascending week
// order and values kept in integer cents, so a couple's credits always add up
// to its value exactly. Weeks before the Anchor Week add nothing. A couple
// gets an entry for every week from its first input on.
export function danceCardLedger(weeks: DanceCardWeek[], anchorWeek: number, rule: DanceCardLedgerRule): DanceCardLedger {
  return rule.version === "v2" ? curveLedger(weeks, anchorWeek, rule) : survivalLedger(weeks, anchorWeek, rule);
}

function curveLedger(weeks: DanceCardWeek[], anchorWeek: number, rule: DanceCardV2Rule): DanceCardLedger {
  const ledger: DanceCardLedger = new Map();
  const cumulative = new Map<string, number>();
  for (const week of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (week.weekNumber < anchorWeek) continue;
    const inputs = nightScaledScoresByCouple(week.danceScores);
    for (const { coupleId, bonusPoints } of week.outcomes ?? []) {
      if (bonusPoints !== 0) inputs.set(coupleId, (inputs.get(coupleId) ?? 0) + bonusPoints);
    }
    for (const coupleId of new Set([...cumulative.keys(), ...inputs.keys()])) {
      const input = inputs.get(coupleId) ?? 0;
      const before = cumulative.get(coupleId) ?? 0;
      const after = before + input;
      cumulative.set(coupleId, after);
      const valueCents = coupleValueCents(after, rule);
      const entries = ledger.get(coupleId) ?? new Map<number, DanceCardLedgerEntry>();
      entries.set(week.weekNumber, {
        input,
        cumulative: after,
        valueCents,
        creditCents: valueCents - coupleValueCents(before, rule),
        survivalCents: 0,
        bonusCents: 0,
      });
      ledger.set(coupleId, entries);
    }
  }
  return ledger;
}

export function survivalValueCents(survivalWeeks: number, rule: DanceCardV3Rule): number {
  return survivalWeeks > 0 ? Math.round(rule.survivalFirst * survivalWeeks ** rule.survivalExponent * 100) : 0;
}

// v3: cumulative counts survival weeks and valueCents is the couple's
// survival so far. A week survives when the couple has a settled outcome and
// none of that week's rows is eliminated, withdrawn or bye.
function survivalLedger(weeks: DanceCardWeek[], anchorWeek: number, rule: DanceCardV3Rule): DanceCardLedger {
  const ledger: DanceCardLedger = new Map();
  const survivalWeeks = new Map<string, number>();
  for (const week of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (week.weekNumber < anchorWeek) continue;
    const inputs = nightScaledScoresByCouple(week.danceScores);
    const bonuses = new Map<string, number>();
    const survived = new Map<string, boolean>();
    for (const { coupleId, bonusPoints, outcome } of week.outcomes ?? []) {
      if (outcome === undefined) throw new Error(`Dance Card v3 needs Week ${week.weekNumber}'s outcomes`);
      bonuses.set(coupleId, (bonuses.get(coupleId) ?? 0) + bonusPoints);
      survived.set(coupleId, (survived.get(coupleId) ?? true) && !NO_SURVIVAL_OUTCOMES.has(outcome as Outcome));
    }
    for (const coupleId of new Set([...survivalWeeks.keys(), ...inputs.keys(), ...survived.keys()])) {
      const input = inputs.get(coupleId) ?? 0;
      const before = survivalWeeks.get(coupleId) ?? 0;
      const after = before + (survived.get(coupleId) ? 1 : 0);
      survivalWeeks.set(coupleId, after);
      const valueCents = survivalValueCents(after, rule);
      const survivalCents = valueCents - survivalValueCents(before, rule);
      const bonusCents = Math.round((bonuses.get(coupleId) ?? 0) * 100);
      const entries = ledger.get(coupleId) ?? new Map<number, DanceCardLedgerEntry>();
      entries.set(week.weekNumber, {
        input,
        cumulative: after,
        valueCents,
        creditCents: Math.round(rule.rate * input * 100) + survivalCents + bonusCents,
        survivalCents,
        bonusCents,
      });
      ledger.set(coupleId, entries);
    }
  }
  return ledger;
}

export function ledgerEntry(ledger: DanceCardLedger, coupleId: string, weekNumber: number): DanceCardLedgerEntry | null {
  return ledger.get(coupleId)?.get(weekNumber) ?? null;
}

// One week's credit per couple, in points.
export function weekCredits(ledger: DanceCardLedger, weekNumber: number): Map<string, number> {
  const credits = new Map<string, number>();
  for (const [coupleId, entries] of ledger) {
    const entry = entries.get(weekNumber);
    if (entry) credits.set(coupleId, entry.creditCents / 100);
  }
  return credits;
}

// Readers hold dance rows tagged with their week and the settled bonuses of
// the weeks they show; this groups them the way the ledger reads them.
export function danceCardWeeksFromRows(
  scores: (DanceScore & { weekNumber: number })[],
  bonuses: { weekNumber: number; coupleId: string; bonusPoints: number; outcome?: string }[] = []
): DanceCardWeek[] {
  const weeks = new Map<number, DanceCardWeek>();
  const weekFor = (weekNumber: number) => {
    const existing = weeks.get(weekNumber);
    if (existing) return existing;
    const created: DanceCardWeek = { weekNumber, danceScores: [], outcomes: [] };
    weeks.set(weekNumber, created);
    return created;
  };
  for (const { weekNumber, ...score } of scores) weekFor(weekNumber).danceScores.push(score);
  for (const { weekNumber, coupleId, bonusPoints, outcome } of bonuses) {
    weekFor(weekNumber).outcomes!.push({ coupleId, bonusPoints, outcome });
  }
  return [...weeks.values()];
}

export function judgesCents(entry: DanceCardLedgerEntry): number {
  return entry.creditCents - entry.survivalCents - entry.bonusCents;
}

// A couple's credits over the weeks one holder had it, in cents: the whole
// credit, or only its judges' part.
export function heldCreditCents(
  ledger: DanceCardLedger,
  coupleId: string,
  fromWeek: number,
  toWeek: number,
  part: "all" | "judges" = "all"
): number {
  let cents = 0;
  for (const [weekNumber, entry] of ledger.get(coupleId) ?? []) {
    if (weekNumber >= fromWeek && weekNumber <= toWeek) cents += part === "judges" ? judgesCents(entry) : entry.creditCents;
  }
  return cents;
}

// A v2 credit covers a couple's whole week, so a week still posting reads
// its already-published sibling nights too, whichever nights a page shows.
export function danceCardWeekEpisodeIds(
  shownEpisodeIds: string[],
  weekEpisodes: { id: string; results_published_at?: string | null }[]
): string[] {
  return [...new Set([...shownEpisodeIds, ...weekEpisodes.filter((e) => e.results_published_at).map((e) => e.id)])];
}
