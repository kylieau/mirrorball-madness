import { describe, expect, it } from "vitest";
import { clampSlotsToWeek, formerSlotsForWeek, judgePointsThroughWeek, slotActiveInWeek } from "./roster-couple-points";

const base = { judgesScoreStartsWeek: 1, week: 3, multiplier: 2, categoryWeight: 1 };
const slot = (coupleId: string, startWeek: number, endWeek: number | null = null) => ({
  managerId: "m",
  coupleId,
  startWeek,
  endWeek,
});
// One three-judge dance per week unless an episode id is given, so the
// stored scaled score equals the raw total.
const score = (coupleId: string, weekNumber: number, scaledScore: number, episodeId = `ep${weekNumber}`) => ({
  episodeId,
  coupleId,
  weekNumber,
  totalScore: scaledScore,
  scaledScore,
  maxScore: null,
});

describe("slotActiveInWeek", () => {
  it("covers start through end inclusive, open-ended when end is null", () => {
    expect(slotActiveInWeek(slot("a", 2, 4), 1)).toBe(false);
    expect(slotActiveInWeek(slot("a", 2, 4), 2)).toBe(true);
    expect(slotActiveInWeek(slot("a", 2, 4), 4)).toBe(true);
    expect(slotActiveInWeek(slot("a", 2, 4), 5)).toBe(false);
    expect(slotActiveInWeek(slot("a", 2), 9)).toBe(true);
  });
});

describe("judgePointsThroughWeek", () => {
  it("gives this week's points and a running total, scaled once and rounded once", () => {
    const points = judgePointsThroughWeek({
      ...base,
      categoryWeight: 0.5,
      slots: [slot("a", 1)],
      scores: [score("a", 1, 25), score("a", 2, 26), score("a", 3, 27)],
    });
    expect(points.get("a")).toEqual({ week: 27, total: 78 }); // 27*2*.5, (25+26+27)*2*.5
  });

  it("ignores weeks before the slot started and before Dance Card scored", () => {
    const points = judgePointsThroughWeek({
      ...base,
      judgesScoreStartsWeek: 2,
      slots: [slot("a", 1), slot("b", 3)],
      scores: [score("a", 1, 20), score("a", 2, 20), score("b", 2, 20), score("b", 3, 20)],
    });
    expect(points.get("a")).toEqual({ week: 0, total: 40 });
    expect(points.get("b")).toEqual({ week: 40, total: 40 });
  });

  it("stops a closed slot at its end week and never looks past the selected week", () => {
    const points = judgePointsThroughWeek({
      ...base,
      week: 2,
      slots: [slot("a", 1, 2)],
      scores: [score("a", 2, 10), score("a", 3, 99)],
    });
    expect(points.get("a")).toEqual({ week: 20, total: 20 });
  });

  it("pays a two-dance night once, on the combined marks, and a two-night week per night", () => {
    const points = judgePointsThroughWeek({
      ...base,
      multiplier: 1,
      slots: [slot("a", 1)],
      scores: [
        // Week 2: two nights, one dance each — each night pays on its own.
        score("a", 2, 24, "ep2a"),
        score("a", 2, 27, "ep2b"),
        // Week 3: one night, 28/40 then 36/40 — 64/80 → 24, not 21 + 27.
        { episodeId: "ep3", coupleId: "a", weekNumber: 3, totalScore: 28, scaledScore: 21, maxScore: null },
        { episodeId: "ep3", coupleId: "a", weekNumber: 3, totalScore: 36, scaledScore: 27, maxScore: null },
      ],
    });
    expect(points.get("a")).toEqual({ week: 24, total: 24 + 27 + 24 });
  });
});

describe("judgePointsThroughWeek over more than one period", () => {
  it("adds a couple's periods up, so a couple claimed back keeps its earlier points", () => {
    const points = judgePointsThroughWeek({
      ...base,
      week: 4,
      slots: [slot("a", 1, 2), slot("a", 4)],
      scores: [score("a", 1, 10), score("a", 2, 10), score("a", 3, 99), score("a", 4, 10)],
    });
    expect(points.get("a")).toEqual({ week: 20, total: 60 });
  });

  it("rounds a couple's points once over its periods, not once per period", () => {
    // Two periods of 3.6875 each: 7.375 → 7.38 when rounded once; per period it would be 3.69 + 3.69 = 7.38 only by luck, and 7.37 for other halves.
    const points = judgePointsThroughWeek({
      ...base,
      multiplier: 1,
      categoryWeight: 0.5,
      week: 2,
      slots: [slot("a", 1, 1), slot("a", 2)],
      scores: [score("a", 1, 7.375), score("a", 2, 7.375)],
    });
    expect(points.get("a")).toEqual({ week: 3.69, total: 7.38 });
  });
});

describe("clampSlotsToWeek", () => {
  const periods = [
    { managerId: "kim", coupleId: "a", startWeek: 1, endWeek: 9 },
    { managerId: "pat", coupleId: "a", startWeek: 10, endWeek: null },
    { managerId: "lou", coupleId: "b", startWeek: 11, endWeek: null },
  ];

  it("shows a holding that starts the week after the cutoff, and hides later ones", () => {
    // Week 9 scored: tonight's claims start Week 10 and are public already.
    expect(clampSlotsToWeek(periods, 9)).toEqual(periods.slice(0, 2));
  });

  it("keeps a holding open past the cutoff, and hides the one that replaced it", () => {
    expect(clampSlotsToWeek(periods, 8)).toEqual([{ managerId: "kim", coupleId: "a", startWeek: 1, endWeek: null }]);
  });

  it("keeps every draft holding before anything is scored", () => {
    const draft = [{ managerId: "kim", coupleId: "a", startWeek: 1, endWeek: null }];
    expect(clampSlotsToWeek(draft, 0)).toEqual(draft);
  });
});

describe("formerSlotsForWeek", () => {
  const periods = [
    { managerId: "kim", coupleId: "a", startWeek: 1, endWeek: 9 },
    { managerId: "pat", coupleId: "a", startWeek: 10, endWeek: null },
    { managerId: "kim", coupleId: "b", startWeek: 2, endWeek: 3 },
    { managerId: "kim", coupleId: "b", startWeek: 6, endWeek: 7 },
    { managerId: "kim", coupleId: "c", startWeek: 1, endWeek: 4 },
    { managerId: "kim", coupleId: "c", startWeek: 8, endWeek: null },
    { managerId: "kim", coupleId: "d", startWeek: 1, endWeek: 2 },
  ];

  it("lists the couples that left before the paged week, newest end first, every period together", () => {
    expect(formerSlotsForWeek(periods, "kim", 10, 3)).toEqual([
      { coupleId: "a", periods: [periods[0]] },
      { coupleId: "b", periods: [periods[2], periods[3]] },
    ]);
  });

  it("treats a couple held again in the paged week as current, and skips periods before the Anchor Week", () => {
    // c is held in Week 10; d ended before the Anchor Week and never scored.
    expect(formerSlotsForWeek(periods, "kim", 10, 3).map((f) => f.coupleId)).toEqual(["a", "b"]);
    expect(formerSlotsForWeek(periods, "kim", 10, 1).map((f) => f.coupleId)).toEqual(["a", "b", "d"]);
  });

  it("shows nothing for a week inside the holding", () => {
    // In Week 9 a is still Kim's and c is held again, so only b and d have left.
    expect(formerSlotsForWeek(periods, "kim", 9, 1).map((f) => f.coupleId)).toEqual(["b", "d"]);
    expect(formerSlotsForWeek(periods, "kim", 2, 1)).toEqual([]);
  });
});
