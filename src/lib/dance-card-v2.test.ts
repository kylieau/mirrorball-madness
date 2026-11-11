import { describe, expect, it } from "vitest";
import {
  coupleValueCents,
  DANCE_CARD_V2_COEFFICIENTS,
  DANCE_CARD_V2_EXPONENT,
  DANCE_CARD_V3_RATES,
  DANCE_CARD_V3_SURVIVAL_EXPONENT,
  DANCE_CARD_V3_SURVIVAL_FIRST,
  danceCardLedger,
  danceCardRule,
  danceCardV3Rule,
  ledgerEntry,
  survivingCoupleIds,
  weekCredits,
  type DanceCardV2Rule,
  type DanceCardWeek,
} from "./dance-card-v2";
import type { DanceScore } from "./scoring";
import { solveDanceCardV2Coefficients, solveDanceCardV3Rates } from "./strong-play-ceilings";

const rule: DanceCardV2Rule = { version: "v2", exponent: 0.8, coefficient: 0.8884 };

// One legacy dance: scaled = total × 3 / judges.
function dance(coupleId: string, episodeId: string, total: number, judges = 3): DanceScore {
  return { episodeId, coupleId, totalScore: total, scaledScore: (total * 3) / judges, maxScore: null };
}

function week(weekNumber: number, danceScores: DanceScore[], outcomes?: DanceCardWeek["outcomes"]): DanceCardWeek {
  return { weekNumber, danceScores, outcomes };
}

// Harry, Season 35 Weeks 2–8 (Week 5 on is a four-judge panel).
const harryWeeks = [
  week(2, [dance("harry", "e3", 18)]),
  week(3, [dance("harry", "e4", 24)]),
  week(4, [dance("harry", "e5", 24)]),
  week(5, [dance("harry", "e6", 33, 4)]),
  week(6, [dance("harry", "e7", 36, 4)]),
  week(7, [dance("harry", "e8", 40, 4)]),
  week(8, [dance("harry", "e9", 40, 4)]),
];

describe("danceCardRule", () => {
  it("is v1 unless the league is switched to v2", () => {
    expect(danceCardRule({}, 2)).toEqual({ version: "v1" });
    expect(danceCardRule({ dance_card_version: "v1" }, 2)).toEqual({ version: "v1" });
    expect(danceCardRule({ dance_card_version: "v2" }, 2)).toEqual(rule);
    expect(danceCardRule({ dance_card_version: "v2" }, 3)).toEqual({ ...rule, coefficient: 0.6117 });
  });

  it("scales the two-couple k by 2/N past the model's rosters", () => {
    expect(danceCardRule({ dance_card_version: "v2" }, 8)).toEqual({ ...rule, coefficient: 0.2221 });
  });

  it("pins the coefficient table to the schedule-model solve", () => {
    expect(
      Object.fromEntries(solveDanceCardV2Coefficients(DANCE_CARD_V2_EXPONENT).map((row) => [row.rosterSize, row.coefficient]))
    ).toEqual(DANCE_CARD_V2_COEFFICIENTS);
  });
});

describe("danceCardLedger", () => {
  it("reproduces the frozen-rule Week 2–8 credits for Harry", () => {
    const ledger = danceCardLedger(harryWeeks, 2, rule);
    expect([...ledger.get("harry")!.values()].map((e) => e.creditCents)).toEqual([897, 870, 770, 736, 758, 802, 770]);
    expect(ledgerEntry(ledger, "harry", 8)).toEqual({ input: 30, cumulative: 177.75, valueCents: 5603, creditCents: 770, survivalCents: 0, bonusCents: 0 });
  });

  it("telescopes: a couple's credits add up to its value exactly", () => {
    const ledger = danceCardLedger(harryWeeks, 2, rule);
    const entries = [...ledger.get("harry")!.values()];
    expect(entries.reduce((sum, e) => sum + e.creditCents, 0)).toBe(entries.at(-1)!.valueCents);
  });

  it("pays a one-week couple on its single score and nothing after", () => {
    const ledger = danceCardLedger([week(2, [dance("giada", "e3", 12), dance("harry", "e3", 18)]), week(3, [dance("harry", "e4", 24)])], 2, rule);
    expect(ledgerEntry(ledger, "giada", 2)?.creditCents).toBe(649);
    expect(ledgerEntry(ledger, "giada", 3)).toEqual({ input: 0, cumulative: 12, valueCents: 649, creditCents: 0, survivalCents: 0, bonusCents: 0 });
  });

  it("ignores weeks before the Anchor Week", () => {
    const ledger = danceCardLedger([week(1, [dance("harry", "e1", 21)]), ...harryWeeks], 2, rule);
    expect(ledger.get("harry")!.has(1)).toBe(false);
    expect(ledgerEntry(ledger, "harry", 8)?.valueCents).toBe(5603);
  });

  it("sorts weeks before summing", () => {
    const ledger = danceCardLedger([...harryWeeks].reverse(), 2, rule);
    expect([...ledger.get("harry")!.values()].map((e) => e.creditCents)).toEqual([897, 870, 770, 736, 758, 802, 770]);
  });

  it("gives identical histories identical credits", () => {
    const ledger = danceCardLedger(
      harryWeeks.map((w) => ({ ...w, danceScores: [...w.danceScores, { ...w.danceScores[0], coupleId: "twin" }] })),
      2,
      rule
    );
    expect(ledger.get("twin")).toEqual(ledger.get("harry"));
  });

  it("never lowers the value for a nonnegative week", () => {
    const ledger = danceCardLedger(harryWeeks, 2, rule);
    for (const entry of ledger.get("harry")!.values()) expect(entry.creditCents).toBeGreaterThanOrEqual(0);
  });

  it("pools a couple's dances on one night into one input (28/40 + 36/40 = 24)", () => {
    const own = dance("amber", "e9", 28, 4);
    const team: DanceScore = { episodeId: "e9", coupleId: "amber", totalScore: 36, scaledScore: 27, maxScore: 40, teamId: "t" };
    const ledger = danceCardLedger([week(8, [own, team])], 2, rule);
    expect(ledgerEntry(ledger, "amber", 8)?.input).toBe(24);
  });

  it("pays two nights in one week each on its own night", () => {
    const ledger = danceCardLedger([week(1, [dance("a", "n1", 24), dance("a", "n2", 27)])], 1, rule);
    expect(ledgerEntry(ledger, "a", 1)?.input).toBe(51);
  });

  it("puts bonus-round points and the Fantasy Bonus in the numerator", () => {
    const winner: DanceScore = { episodeId: "e10", coupleId: "a", totalScore: 3, scaledScore: 0, maxScore: 0, teamId: "heat" };
    const ledger = danceCardLedger([week(9, [dance("a", "e10", 27), winner], [{ coupleId: "a", bonusPoints: 2 }])], 9, rule);
    // (27 + 3) / 30 × 30 = 30, plus the 2-point Fantasy Bonus.
    expect(ledgerEntry(ledger, "a", 9)?.input).toBe(32);
  });

  it("values zero or a negative total at nothing", () => {
    expect(coupleValueCents(0, rule)).toBe(0);
    expect(coupleValueCents(-3, rule)).toBe(0);
  });

  it("reads one week's credits in points", () => {
    expect(weekCredits(danceCardLedger(harryWeeks, 2, rule), 8)).toEqual(new Map([["harry", 7.7]]));
  });
});

describe("Dance Card v3", () => {
  const v3 = danceCardV3Rule(2);
  const safe = (coupleId: string, bonusPoints = 0) => ({ coupleId, bonusPoints, outcome: "safe" });

  it("is chosen by the league's version and pinned to the schedule-model solve", () => {
    expect(danceCardRule({ dance_card_version: "v3" }, 2)).toEqual({ version: "v3", rate: 0.2731, survivalFirst: 3, survivalExponent: 0.5 });
    expect(
      Object.fromEntries(
        solveDanceCardV3Rates(DANCE_CARD_V3_SURVIVAL_FIRST, DANCE_CARD_V3_SURVIVAL_EXPONENT).map((row) => [row.rosterSize, row.rate])
      )
    ).toEqual(DANCE_CARD_V3_RATES);
  });

  it("pays judges at one rate and survival tapering by 3.00 × √n", () => {
    const weeks = [2, 3, 4, 5].map((n) => week(n, [dance("a", `e${n}`, 24)], [safe("a")]));
    const entries = [...danceCardLedger(weeks, 2, v3).get("a")!.values()];
    // 24 × 0.2731 = 6.55; survival 3.00, 4.24, 5.20, 6.00 so far.
    expect(entries.map((e) => e.creditCents)).toEqual([655 + 300, 655 + 124, 655 + 96, 655 + 80]);
    expect(entries.map((e) => e.survivalCents)).toEqual([300, 124, 96, 80]);
  });

  it("pays no survival for an elimination, a withdrawal or a bye, and counts only survived weeks", () => {
    const weeks = [
      week(2, [dance("a", "e2", 24)], [safe("a")]),
      week(3, [], [{ coupleId: "a", bonusPoints: 0, outcome: "bye" }]),
      week(4, [dance("a", "e4", 24)], [safe("a")]),
      week(5, [dance("a", "e5", 24)], [{ coupleId: "a", bonusPoints: 0, outcome: "eliminated" }]),
    ];
    expect([...danceCardLedger(weeks, 2, v3).get("a")!.values()].map((e) => e.survivalCents)).toEqual([300, 0, 124, 0]);
  });

  it("counts the Finale as survived for every finalist, the ones entered as Eliminated included", () => {
    const out = (coupleId: string, outcome: string) => ({ coupleId, bonusPoints: 0, outcome });
    const finalists = ["a", "b", "c", "d", "e"];
    const weeks = [
      week(2, finalists.map((id) => dance(id, "e2", 24)), finalists.map((id) => safe(id))),
      week(
        3,
        ["a", "b", "c", "d"].map((id) => dance(id, "e3", 24)),
        [out("a", "winner"), out("b", "runner_up"), out("c", "third_place"), out("d", "eliminated"), out("e", "withdrawn")]
      ),
    ];
    const ledger = danceCardLedger(weeks, 2, v3);
    // Fourth place gets the same second step as the podium; a withdrawal doesn't.
    expect(["a", "b", "c", "d", "e"].map((id) => ledgerEntry(ledger, id, 3)?.survivalCents)).toEqual([124, 124, 124, 124, 0]);
    expect(survivingCoupleIds(weeks[1].outcomes!)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("keeps an elimination out of survival in a week that names no winner, on any of its nights", () => {
    const outcomes = [
      { coupleId: "a", bonusPoints: 0, outcome: "safe" },
      { coupleId: "a", bonusPoints: 0, outcome: "eliminated" },
      { coupleId: "b", bonusPoints: 0, outcome: "safe" },
    ];
    expect(survivingCoupleIds(outcomes)).toEqual(new Set(["b"]));
  });

  it("pays the Fantasy Bonus at face value, outside the judges' input", () => {
    const entry = ledgerEntry(danceCardLedger([week(9, [dance("a", "e10", 27)], [safe("a", 3)])], 9, v3), "a", 9)!;
    expect(entry.input).toBe(27);
    expect(entry.bonusCents).toBe(300);
    expect(entry.creditCents).toBe(Math.round(27 * 0.2731 * 100) + 300 + 300);
  });

  it("pays no survival before the week is settled", () => {
    expect(ledgerEntry(danceCardLedger([week(9, [dance("a", "e10", 27)])], 9, v3), "a", 9)?.survivalCents).toBe(0);
  });

  it("refuses outcome rows without the outcome", () => {
    expect(() => danceCardLedger([week(9, [], [{ coupleId: "a", bonusPoints: 0 }])], 9, v3)).toThrow(/needs Week 9's outcomes/);
  });
});
