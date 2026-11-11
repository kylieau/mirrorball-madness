import { describe, expect, it } from "vitest";
import {
  buildScoreHistory,
  plannedEliminationWeek,
  groupHistory,
  withLifelineLines,
  withTradeLines,
  type HistoryModule,
  type HistoryWeekData,
  type ManagerHistoryInput,
  type ScoreHistoryLine,
} from "./score-history";
import {
  computeGrandFinalePoints,
  computeWeeklyScores,
  eliminationPositionRanges,
  finalPlacementFromRange,
  RESOLVING_OUTCOMES,
  type CategoryWeights,
  type ScoringSettings,
} from "./scoring";
import { eligibleGrandFinalePredictions, scaleGrandFinaleLateFactors } from "./grand-finale-late";

const scoring: ScoringSettings = {
  judgesScoreMultiplier: 0.15,
  survivalPoints: 2,
  eliminationPredictionPoints: 8,
  topScorerPredictionPoints: 6,
  firstPlacePoints: 10,
  secondPlacePoints: 7,
  thirdPlacePoints: 5,
  fourthPlacePoints: 3,
  fifthPlacePoints: 1,
  curtainCallNearMissEnabled: true,
};

const grandFinale = {
  method: "distance_based" as const,
  distancePenalty: 1,
  tierSize: null,
  tierPayStyle: "equal" as const,
  pointsPerCorrect: 6,
};

// Five couples: E out in week 1, C and D out together in week 2 (double),
// finale in week 3 with B runner-up and A winner.
const couples = [
  { id: "A", status: "winner", elimination_week: null },
  { id: "B", status: "runner_up", elimination_week: null },
  { id: "C", status: "eliminated", elimination_week: 2 },
  { id: "D", status: "eliminated", elimination_week: 2 },
  { id: "E", status: "eliminated", elimination_week: 1 },
];

const coupleNames = new Map([
  ["A", "Whitney"],
  ["B", "Ilona"],
  ["C", "Danny"],
  ["D", "Robert"],
  ["E", "Ezra"],
]);

const weeks: HistoryWeekData[] = [
  {
    weekNumber: 1,
    isDoubleElimination: false,
    danceScores: [
      { episodeId: "ep1", coupleId: "A", totalScore: 30, scaledScore: 30, maxScore: null },
      { episodeId: "ep1", coupleId: "B", totalScore: 24, scaledScore: 24, maxScore: null },
      { episodeId: "ep1", coupleId: "C", totalScore: 20, scaledScore: 20, maxScore: null },
      { episodeId: "ep1", coupleId: "D", totalScore: 18, scaledScore: 18, maxScore: null },
      { episodeId: "ep1", coupleId: "E", totalScore: 12, scaledScore: 12, maxScore: null },
    ],
    outcomes: [
      { coupleId: "A", outcome: "safe", bonusPoints: 0 },
      { coupleId: "B", outcome: "safe", bonusPoints: 1 },
      { coupleId: "C", outcome: "safe", bonusPoints: 0 },
      { coupleId: "D", outcome: "safe", bonusPoints: 0 },
      { coupleId: "E", outcome: "eliminated", bonusPoints: 0 },
    ],
    inJeopardyCoupleIds: [],
  },
  // A guest-judge night: four judges, so totals are out of 40 and pay on the
  // 30-point basis. A won a Dance-Off worth +3, a bonus round in points.
  {
    weekNumber: 2,
    isDoubleElimination: true,
    danceScores: [
      { episodeId: "ep1", coupleId: "A", totalScore: 38, scaledScore: 28.5, maxScore: null },
      { episodeId: "ep1", coupleId: "A", totalScore: 3, scaledScore: 0, maxScore: 0 },
      { episodeId: "ep1", coupleId: "B", totalScore: 35, scaledScore: 26.25, maxScore: null },
      { episodeId: "ep1", coupleId: "C", totalScore: 30, scaledScore: 22.5, maxScore: null },
      { episodeId: "ep1", coupleId: "D", totalScore: 22, scaledScore: 16.5, maxScore: null },
    ],
    outcomes: [
      { coupleId: "A", outcome: "safe", bonusPoints: 0 },
      { coupleId: "B", outcome: "safe", bonusPoints: 0 },
      { coupleId: "C", outcome: "eliminated", bonusPoints: 0 },
      { coupleId: "D", outcome: "eliminated", bonusPoints: 0 },
    ],
    inJeopardyCoupleIds: [],
  },
  {
    weekNumber: 3,
    isDoubleElimination: false,
    danceScores: [
      { episodeId: "ep1", coupleId: "A", totalScore: 30, scaledScore: 30, maxScore: null },
      { episodeId: "ep1", coupleId: "B", totalScore: 29, scaledScore: 29, maxScore: null },
    ],
    outcomes: [
      { coupleId: "A", outcome: "winner", bonusPoints: 0 },
      { coupleId: "B", outcome: "runner_up", bonusPoints: 0 },
    ],
    inJeopardyCoupleIds: ["B"],
  },
];

// Week 2 is planned as a single elimination even though two couples actually
// went home: a double is only known once it airs.
const weekSchedule = [
  { weekNumber: 1, eliminations: 1 },
  { weekNumber: 2, eliminations: 1 },
  { weekNumber: 3, eliminations: 0 },
];

const base: ManagerHistoryInput = {
  weekSchedule,
  scoring,
  anchorWeek: 1,
  categoryWeights: { judges: 1, eliminations: 1, bonus: 1 },
  grandFinale,
  couples,
  coupleNames,
  weeks,
  rosterSlots: [
    { managerId: "m", coupleId: "A", startWeek: 1, endWeek: null },
    { managerId: "m", coupleId: "E", startWeek: 1, endWeek: 1 },
    { managerId: "m", coupleId: "D", startWeek: 2, endWeek: 2 },
    { managerId: "m", coupleId: "B", startWeek: 3, endWeek: null },
  ],
  predictions: [
    { weekNumber: 1, eliminatedCoupleId: "E", eliminatedCoupleId2: null, topScorerCoupleId: "A" },
    { weekNumber: 2, eliminatedCoupleId: "C", eliminatedCoupleId2: "B", topScorerCoupleId: "B" },
    { weekNumber: 3, eliminatedCoupleId: "B", eliminatedCoupleId2: null, topScorerCoupleId: "B" },
  ],
  grandFinalePredictions: [
    { coupleId: "E", predictedPosition: 2 },
    { coupleId: "C", predictedPosition: 2 },
    { coupleId: "D", predictedPosition: 3 },
    { coupleId: "B", predictedPosition: 4 },
    { coupleId: "A", predictedPosition: 5 },
  ],
};

function engineWeek(input: ManagerHistoryInput, week: HistoryWeekData) {
  const ranges = eliminationPositionRanges(input.couples);
  const total = input.couples.length;
  const resolved = week.outcomes.filter((o) => RESOLVING_OUTCOMES.has(o.outcome));
  const lateByManager = new Map<string, { lateFactor: number; ineligibleCoupleIds: ReadonlySet<string> }>();
  if (input.grandFinaleLateFactor != null || input.grandFinaleIneligibleCoupleIds) {
    lateByManager.set("m", {
      lateFactor: input.grandFinaleLateFactor ?? 1,
      ineligibleCoupleIds: input.grandFinaleIneligibleCoupleIds ?? new Set<string>(),
    });
  }
  const grandFinalePointsByManager = scaleGrandFinaleLateFactors(
    computeGrandFinalePoints({
      predictions: eligibleGrandFinalePredictions(
        input.grandFinalePredictions.map((p) => ({ managerId: "m", ...p })),
        lateByManager
      ),
      resolvedCouples: resolved.map((o) => ({
        coupleId: o.coupleId,
        actualPosition: ranges.get(o.coupleId)!.start,
        actualPositionEnd: ranges.get(o.coupleId)!.end,
      })),
      totalCouples: total,
      ...input.grandFinale,
    }),
    lateByManager
  );
  const prediction = input.predictions.find((p) => p.weekNumber === week.weekNumber);
  const started = week.weekNumber >= input.anchorWeek;
  return computeWeeklyScores({
    scoringSettings: input.scoring,
    rosterSlots: started
      ? input.rosterSlots
          .filter((s) => s.startWeek <= week.weekNumber && (s.endWeek === null || s.endWeek >= week.weekNumber))
          .map((s) => ({ managerId: "m", coupleId: s.coupleId }))
      : [],
    danceScores: week.danceScores,
    episodeOutcomes: week.outcomes.map((o) => ({
      ...o,
      finalPlacement: RESOLVING_OUTCOMES.has(o.outcome) ? finalPlacementFromRange(ranges.get(o.coupleId)!, total) : null,
    })),
    predictions: prediction && started
      ? [
          {
            managerId: "m",
            predictedEliminatedCoupleId: prediction.eliminatedCoupleId,
            predictedEliminatedCoupleId2: prediction.eliminatedCoupleId2,
            predictedTopScorerCoupleId: prediction.topScorerCoupleId,
          },
        ]
      : [],
    isDoubleElimination: week.isDoubleElimination,
    couplesRemaining: input.couples.filter((c) => c.elimination_week === null || c.elimination_week >= week.weekNumber)
      .length,
    totalCouples: total,
    categoryWeights: input.categoryWeights,
    grandFinalePointsByManager: started ? grandFinalePointsByManager : {},
    inJeopardyCoupleIds: week.inJeopardyCoupleIds,
  }).find((s) => s.managerId === "m");
}

const text = (l: ScoreHistoryLine) => (l.result ? `${l.label} · ${l.result}` : l.label);

function sumLines(lines: ScoreHistoryLine[], weekNumber: number, module: HistoryModule): number {
  return lines
    .filter((l) => l.weekNumber === weekNumber && l.module === module)
    .reduce((sum, l) => sum + l.points, 0);
}

describe.each<[string, CategoryWeights]>([
  ["default weights", { judges: 1, eliminations: 1, bonus: 1 }],
  ["custom weights", { judges: 1.5, eliminations: 0.5, bonus: 2 }],
])("buildScoreHistory parity with the scoring engine (%s)", (_name, categoryWeights) => {
  const input = { ...base, categoryWeights };
  const lines = buildScoreHistory(input);

  it.each(weeks.map((w) => w.weekNumber))("week %i line sums match each module's weighted weekly points", (weekNumber) => {
    const week = weeks.find((w) => w.weekNumber === weekNumber)!;
    const engine = engineWeek(input, week)!;
    expect(sumLines(lines, weekNumber, "danceCard")).toBeCloseTo(engine.rosterPoints * categoryWeights.judges, 1);
    expect(sumLines(lines, weekNumber, "curtainCall")).toBeCloseTo(engine.predictionPoints * categoryWeights.eliminations, 1);
    expect(sumLines(lines, weekNumber, "grandFinale")).toBeCloseTo(engine.grandFinalePoints * categoryWeights.bonus, 1);
  });
});

describe("buildScoreHistory parity when the Anchor Week is 2", () => {
  const input = { ...base, anchorWeek: 2 };
  const lines = buildScoreHistory(input);

  it.each(weeks.map((w) => w.weekNumber))("week %i matches the engine, and Week 1 pays nothing", (weekNumber) => {
    const engine = engineWeek(input, weeks.find((w) => w.weekNumber === weekNumber)!) ?? {
      rosterPoints: 0,
      predictionPoints: 0,
      grandFinalePoints: 0,
    };
    expect(sumLines(lines, weekNumber, "danceCard")).toBeCloseTo(engine.rosterPoints, 1);
    expect(sumLines(lines, weekNumber, "curtainCall")).toBeCloseTo(engine.predictionPoints, 1);
    expect(sumLines(lines, weekNumber, "grandFinale")).toBeCloseTo(engine.grandFinalePoints, 1);
    if (weekNumber === 1) expect(engine.rosterPoints + engine.predictionPoints + engine.grandFinalePoints).toBe(0);
  });
});

describe("buildScoreHistory lines", () => {
  const lines = buildScoreHistory(base);

  it("hides zero-point lines", () => {
    expect(lines.every((l) => l.points !== 0)).toBe(true);
    expect(lines.some((l) => l.label.includes("Danny: Jdg") && l.weekNumber === 3)).toBe(false);
  });

  it("labels judges math and survival", () => {
    expect(lines.map((l) => l.label)).toContain("Whitney: Jdg 30 × 0.15");
    expect(lines.map((l) => l.label)).toContain("Whitney: Survival");
  });

  it("shows a guest-judge night's TV total and the 30-point basis it pays on, with bonus points beside the marks", () => {
    // 38/40 plus a +3 Dance-Off: 41/40 × 30 = 30.75.
    expect(lines.map((l) => l.label)).toContain("Whitney: Jdg 38+3→30.75 × 0.15");
    expect(lines.map((l) => l.label)).toContain("Robert: Jdg 22→16.5 × 0.15");
  });

  it("gives an eliminated couple judges points but no survival", () => {
    const labels = lines.filter((l) => l.weekNumber === 1).map((l) => l.label);
    expect(labels).toContain("Ezra: Jdg 12 × 0.15");
    expect(labels).not.toContain("Ezra: Survival");
  });

  it("credits the podium in the week the couple's finish is known, naming the couple", () => {
    const labels = lines.filter((l) => l.weekNumber === 3).map((l) => l.label);
    expect(labels).toContain("Season Podium: Whitney, 1st Place");
    expect(labels).toContain("Season Podium: Ilona, 2nd Place");
    expect(lines.find((l) => l.label.startsWith("Season Podium: Robert"))?.weekNumber).toBe(2);
  });

  it("gives a couple out in a top-five double the better of the shared placements", () => {
    const robert = lines.find((l) => l.label.startsWith("Season Podium: Robert"));
    expect(robert).toMatchObject({ label: "Season Podium: Robert, 3rd Place", points: scoring.thirdPlacePoints });
  });

  it("scores both Curtain Call elimination picks on a double-elimination week and skips a miss", () => {
    const week2 = lines.filter((l) => l.weekNumber === 2 && l.module === "curtainCall").map(text);
    expect(week2).toEqual(["Home: Danny · ✓"]);
  });

  it("marks In Jeopardy and within-one top-scorer picks as near misses", () => {
    const week3 = lines.filter((l) => l.weekNumber === 3 && l.module === "curtainCall").map(text);
    expect(week3).toEqual(["Home: Ilona · 🤏", "High: Ilona · 🤏"]);
  });

  it("credits Grand Finale picks when the couple's position resolves, tagged Exact or by how many spots off", () => {
    const gf = lines.filter((l) => l.module === "grandFinale");
    expect(gf.find((l) => l.label.includes("Ezra"))).toMatchObject({ weekNumber: 1 });
    expect(text(gf.find((l) => l.label.includes("Ezra"))!)).toBe("Ezra: Elim W2 · Off 1");
    expect(text(gf.find((l) => l.label.includes("Danny"))!)).toBe("Danny: Elim W2 · Exact");
    expect(text(gf.find((l) => l.label.includes("Robert"))!)).toBe("Robert: Elim W2 · Exact");
    expect(gf.find((l) => l.label.includes("Ilona"))).toMatchObject({ weekNumber: 3 });
    expect(text(gf.find((l) => l.label.includes("Ilona"))!)).toBe("Ilona: Finale · Exact");
  });

  it("scales lines by the category weight and says so only when the weight isn't 1", () => {
    const weighted = buildScoreHistory({ ...base, categoryWeights: { judges: 0.5, eliminations: 1, bonus: 1 } });
    expect(weighted.find((l) => l.label.startsWith("Whitney: Jdg"))).toMatchObject({
      label: "Whitney: Jdg 30 × 0.15 × 0.5 Wt",
      points: 2.25,
    });
    expect(lines.some((l) => l.label.includes("Wt"))).toBe(false);
  });

  it("scales a penalized late bracket and skips couples already resolved at submit", () => {
    const late = buildScoreHistory({
      ...base,
      grandFinaleLateFactor: 0.5,
      grandFinaleIneligibleCoupleIds: new Set(["E"]),
    });
    const gf = late.filter((l) => l.module === "grandFinale");
    expect(gf.some((l) => l.label.includes("Ezra"))).toBe(false);
    const danny = gf.find((l) => l.label.includes("Danny"))!;
    expect(danny.label).toContain("× 0.5 late");
    expect(danny.points).toBeCloseTo(
      buildScoreHistory(base).find((l) => l.module === "grandFinale" && l.label.includes("Danny"))!.points * 0.5,
      2
    );
    const week = weeks.find((w) => w.weekNumber === 2)!;
    const engine = engineWeek(
      { ...base, grandFinaleLateFactor: 0.5, grandFinaleIneligibleCoupleIds: new Set(["E"]) },
      week
    )!;
    expect(sumLines(late, 2, "grandFinale")).toBeCloseTo(engine.grandFinalePoints * base.categoryWeights.bonus, 1);
  });

  it("leaves full-weight late brackets unlabeled for peers", () => {
    const late = buildScoreHistory({ ...base, grandFinaleLateFactor: 1 });
    expect(late.filter((l) => l.module === "grandFinale").every((l) => !/late/i.test(l.label))).toBe(true);
  });

  it("pays nothing in any module before the league's Anchor Week", () => {
    const late = buildScoreHistory({ ...base, anchorWeek: 3 });
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((l) => l.weekNumber >= 3)).toBe(true);
  });

  it("emits nothing for weeks the viewer can't see", () => {
    const clamped = buildScoreHistory({ ...base, weeks: weeks.slice(0, 1) });
    expect(clamped.every((l) => l.weekNumber === 1)).toBe(true);
    expect(clamped.some((l) => l.label.includes("1st Place"))).toBe(false);
  });
});

describe("plannedEliminationWeek", () => {
  const schedule = [
    { weekNumber: 1, eliminations: 1 },
    { weekNumber: 2, eliminations: 0 },
    { weekNumber: 3, eliminations: 2 },
    { weekNumber: 4, eliminations: 1 },
    { weekNumber: 5, eliminations: 0 },
  ];

  it("maps each spot to the week that eliminates it, counting doubles and skipping no-elimination weeks", () => {
    expect([1, 2, 3, 4].map((spot) => plannedEliminationWeek(spot, schedule))).toEqual([1, 3, 3, 4]);
  });

  it("returns null for spots past the last elimination (the finale)", () => {
    expect(plannedEliminationWeek(5, schedule)).toBeNull();
  });
});

describe("buildScoreHistory Grand Finale week labels", () => {
  it("uses the real elimination count for weeks that aired, not the planned shape", () => {
    const gf = buildScoreHistory(base).filter((l) => l.module === "grandFinale");
    expect(text(gf.find((l) => l.label.includes("Robert"))!)).toBe("Robert: Elim W2 · Exact");
  });

  it("falls back to the planned shape for weeks the viewer can't see yet", () => {
    const plannedOnly = buildScoreHistory({ ...base, weeks: weeks.slice(0, 1) });
    expect(plannedOnly.filter((l) => l.module === "grandFinale").every((l) => l.weekNumber === 1)).toBe(true);
  });
});

describe("groupHistory", () => {
  const lines = buildScoreHistory(base);

  it("orders weeks newest first and keeps earned order within a week", () => {
    const groups = groupHistory(lines, []);
    expect(groups.map((g) => g.weekNumber)).toEqual([3, 2, 1]);
    const week1 = groups[2].rows.map((r) => r.module);
    expect(week1.indexOf("curtainCall")).toBeLessThan(week1.indexOf("danceCard"));
    expect(week1.indexOf("danceCard")).toBeLessThan(week1.indexOf("grandFinale"));
  });

  it("accumulates the run oldest to newest over the filtered lines", () => {
    const all = groupHistory(lines, []);
    const last = all[0].rows.at(-1)!;
    expect(last.run).toBeCloseTo(lines.reduce((s, l) => s + l.points, 0), 2);

    const dance = groupHistory(lines, ["danceCard"]);
    expect(dance.at(0)!.rows.at(-1)!.run).toBeCloseTo(
      lines.filter((l) => l.module === "danceCard").reduce((s, l) => s + l.points, 0),
      2
    );
  });

  it("combines several selected modules", () => {
    const groups = groupHistory(lines, ["curtainCall", "grandFinale"]);
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.every((r) => r.module === "curtainCall" || r.module === "grandFinale")).toBe(true);
    expect(groups[0].rows.at(-1)!.run).toBeCloseTo(
      lines.filter((l) => l.module !== "danceCard").reduce((s, l) => s + l.points, 0),
      2
    );
  });

  it("omits weeks the filter leaves empty", () => {
    const gfOnly = groupHistory(lines.filter((l) => l.weekNumber !== 2 || l.module !== "grandFinale"), ["grandFinale"]);
    expect(gfOnly.map((g) => g.weekNumber)).toEqual([3, 1]);
  });
});

describe("a week being revealed", () => {
  const revealingWeek: HistoryWeekData = {
    weekNumber: 3,
    isDoubleElimination: false,
    danceScores: [
      { episodeId: "ep1", coupleId: "A", totalScore: 30, scaledScore: 30, maxScore: null },
      { episodeId: "ep1", coupleId: "B", totalScore: 29, scaledScore: 29, maxScore: null },
    ],
    outcomes: [],
    inJeopardyCoupleIds: [],
  };
  const revealing: ManagerHistoryInput = {
    ...base,
    weeks: [weeks[0], weeks[1], revealingWeek],
    predictions: base.predictions.filter((p) => p.weekNumber !== 3),
  };

  it("lists only judges lines for it and matches the reveal-mode engine total", () => {
    const lines = buildScoreHistory(revealing);
    const week3 = lines.filter((l) => l.weekNumber === 3);
    expect(week3.length).toBeGreaterThan(0);
    expect(week3.every((l) => l.module === "danceCard" && l.label.includes("Jdg"))).toBe(true);
    const engine = engineWeek({ ...revealing, predictions: [], grandFinalePredictions: [] }, revealingWeek);
    expect(sumLines(lines, 3, "danceCard")).toBeCloseTo(engine!.rosterPoints, 2);
  });
});

describe("withLifelineLines", () => {
  const line = (weekNumber: number, module: HistoryModule, id: string): ScoreHistoryLine => ({
    id,
    weekNumber,
    module,
    label: id,
    points: 1,
  });
  const lines = [line(4, "curtainCall", "cc4"), line(4, "danceCard", "dc4"), line(4, "grandFinale", "gf4"), line(5, "danceCard", "dc5")];
  const names = new Map([["star", "Harry"]]);

  it("adds a line per paid Lifeline and one for the Equalizer, among their week's Dance Card lines", () => {
    const result = withLifelineLines(
      lines,
      {
        weight: 0.5,
        payouts: [
          { weekNumber: 5, slotNumber: 2, coupleId: "star", weightedPoints: 2.25 },
          { weekNumber: 5, slotNumber: 1, coupleId: "gone", weightedPoints: 0 },
        ],
        equalizers: [{ weekNumber: 4, weightedPoints: 5.65, weeks: [3, 4] }],
      },
      names
    );
    expect(result.map((row) => row.id)).toEqual(["cc4", "dc4", "lifeline-equalizer:4", "gf4", "dc5", "lifeline:5:2"]);
    expect(result.find((row) => row.id === "lifeline:5:2")).toMatchObject({
      module: "danceCard",
      label: "Lifeline: Harry survives × 0.5 Wt",
      points: 2.25,
    });
    expect(result.find((row) => row.id === "lifeline-equalizer:4")?.label).toBe("Lifeline Backfill, Weeks 3 to 4 × 0.5 Wt");
  });

  it("names a single backfilled week and leaves the lines alone when nothing paid", () => {
    const [backfill] = withLifelineLines([], { weight: 1, payouts: [], equalizers: [{ weekNumber: 4, weightedPoints: 1.69, weeks: [3] }] }, names);
    expect(backfill.label).toBe("Lifeline Backfill, Week 3");
    expect(withLifelineLines(lines, { weight: 1, payouts: [], equalizers: [] }, names)).toBe(lines);
  });
});

describe("withTradeLines", () => {
  const dc4: ScoreHistoryLine = { id: "dc4", weekNumber: 4, module: "danceCard", label: "dc4", points: 1 };
  const gf4: ScoreHistoryLine = { id: "gf4", weekNumber: 4, module: "grandFinale", label: "gf4", points: 1 };
  const managers = new Map([["kim", "Kim & Pat"]]);

  it("lists points a trade moved under Dance Card, in the week they landed on", () => {
    const result = withTradeLines(
      [dc4, gf4],
      [
        { id: "t1", weekNumber: 4, points: -5, otherManagerId: "kim" },
        { id: "t2", weekNumber: 4, points: 2.5, otherManagerId: "gone" },
      ],
      managers
    );
    expect(result.map((row) => row.id)).toEqual(["dc4", "trade:t1", "trade:t2", "gf4"]);
    expect(result[1]).toMatchObject({ module: "danceCard", label: "Trade: points to Kim & Pat", points: -5 });
    expect(result[2].label).toBe("Trade: points from Unknown");
  });

  it("leaves the lines alone without a transfer", () => {
    const lines = [dc4, gf4];
    expect(withTradeLines(lines, [], managers)).toBe(lines);
  });
});
