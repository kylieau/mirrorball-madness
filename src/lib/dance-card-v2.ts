import { nightScaledScoresByCouple, type DanceScore } from "./scoring";

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

export type DanceCardRule =
  | { version: "v1" }
  | { version: "v2"; exponent: number; coefficient: number };

export type DanceCardV2Rule = Extract<DanceCardRule, { version: "v2" }>;

// The model can't seat rosters past six (12 couples, two managers), so a
// larger roster scales the two-couple k by 2/N, which matches the model
// within 3% where both exist.
function coefficientForRoster(rosterSize: number): number {
  return (
    DANCE_CARD_V2_COEFFICIENTS[rosterSize] ??
    Math.round(((DANCE_CARD_V2_COEFFICIENTS[2] * 2) / Math.max(1, rosterSize)) * 10000) / 10000
  );
}

export function danceCardV2Rule(rosterSize: number): DanceCardV2Rule {
  return { version: "v2", exponent: DANCE_CARD_V2_EXPONENT, coefficient: coefficientForRoster(rosterSize) };
}

export function danceCardRule(
  settings: { dance_card_version?: string | null },
  rosterSize: number
): DanceCardRule {
  return settings.dance_card_version === "v2" ? danceCardV2Rule(rosterSize) : { version: "v1" };
}

export function coupleValueCents(cumulative: number, rule: DanceCardV2Rule): number {
  if (!(cumulative > 0)) return 0;
  return Math.round(rule.coefficient * cumulative ** rule.exponent * 100);
}

export type DanceCardWeek = {
  weekNumber: number;
  danceScores: DanceScore[];
  // Settled outcomes only: a Fantasy Bonus joins the week's input like a
  // bonus-round dance.
  outcomes?: { coupleId: string; bonusPoints: number }[];
};

export type DanceCardLedgerEntry = {
  input: number;
  cumulative: number;
  valueCents: number;
  creditCents: number;
};

export type DanceCardLedger = Map<string, Map<number, DanceCardLedgerEntry>>;

// The only place S and V are computed. Inputs are summed in ascending week
// order and values kept in integer cents, so a couple's credits always add up
// to its value exactly. Weeks before the Anchor Week add nothing. A couple
// gets an entry for every week from its first input on.
export function danceCardLedger(weeks: DanceCardWeek[], anchorWeek: number, rule: DanceCardV2Rule): DanceCardLedger {
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
  bonuses: { weekNumber: number; coupleId: string; bonusPoints: number }[] = []
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
  for (const { weekNumber, coupleId, bonusPoints } of bonuses) weekFor(weekNumber).outcomes!.push({ coupleId, bonusPoints });
  return [...weeks.values()];
}

// A couple's credits over the weeks one holder had it, in cents.
export function heldCreditCents(ledger: DanceCardLedger, coupleId: string, fromWeek: number, toWeek: number): number {
  let cents = 0;
  for (const [weekNumber, entry] of ledger.get(coupleId) ?? []) {
    if (weekNumber >= fromWeek && weekNumber <= toWeek) cents += entry.creditCents;
  }
  return cents;
}
