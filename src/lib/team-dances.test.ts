import { describe, expect, it } from "vitest";
import {
  automaticSpecialDanceName,
  oxfordJoin,
  buildNightSummary,
  eligibleTeamMembers,
  isHalfStep,
  isValidPoints,
  legacyTeamDefaults,
  parseSpecialPoints,
  parseTeamMarks,
  recentSuggestions,
  sameTeamMarks,
  specialDanceComplete,
  specialDanceProgress,
  specialDanceSummary,
  addableSpecialDanceParticipants,
  eliminatedBeforeWeek,
  validateSpecialDanceSetup,
  type SpecialDance,
  type SpecialDanceSetupInput,
} from "./team-dances";

const judges = ["carrie", "derek", "bruno", "cynthia"];
const team: SpecialDance = {
  id: "slaytopia",
  episodeId: "ep",
  name: "Slaytopia",
  nameIsAuto: false,
  danceType: "Team Dance",
  scoringMode: "marks",
  danceStyleId: "freestyle",
  secondDanceStyleId: null,
  songs: [{ title: "Zoo" }],
  songTitle: "Zoo",
  details: [
    { label: "Captain", value: "Tatyana", coupleId: "tatyana" },
    { label: "Host", value: "Alfonso Ribeiro", coupleId: null },
  ],
  captainCoupleId: "tatyana",
  hostName: "Alfonso Ribeiro",
  sortOrder: 1,
  memberCoupleIds: ["tatyana", "maura", "amber", "julia"],
  roundId: null,
  heatNumber: null,
  postedAt: null,
  updatedAt: null,
};
const nine = Object.fromEntries(judges.map((j) => [j, "9"]));
describe("mark and point ranges", () => {
  it("accepts half steps only", () => {
    expect(isHalfStep(7.5)).toBe(true);
    expect(isHalfStep(7.25)).toBe(false);
    expect(isHalfStep(Number.NaN)).toBe(false);
  });

  it("allows negative points in half steps within the limit", () => {
    expect([3, -1.5, 0, 100, -100].map(isValidPoints)).toEqual([true, true, true, true, true]);
    expect([100.5, 0.25, Number.NaN].map(isValidPoints)).toEqual([false, false, false]);
  });
});

describe("parseTeamMarks", () => {
  it("is complete only when every judge on the panel holds a whole mark from 1 to 10", () => {
    expect(parseTeamMarks({ carrie: "9", derek: "9", bruno: "9" }, judges)).toMatchObject({ marks: null, filled: 3, invalidJudgeIds: [] });
    expect(parseTeamMarks({ ...nine, derek: "11" }, judges)).toMatchObject({ marks: null, filled: 4, invalidJudgeIds: ["derek"] });
    expect(parseTeamMarks({ ...nine, derek: "x" }, judges).invalidJudgeIds).toEqual(["derek"]);
    expect(parseTeamMarks(nine, judges).marks).toEqual(judges.map((judgeId) => ({ judgeId, score: 9 })));
    expect(parseTeamMarks({ ...nine, cynthia: " 10 " }, judges).marks?.find((m) => m.judgeId === "cynthia")?.score).toBe(10);
  });

  it("completes on two or three judges, never on one or five", () => {
    expect(parseTeamMarks(nine, judges.slice(0, 3)).marks).toHaveLength(3);
    expect(parseTeamMarks(nine, judges.slice(0, 2)).marks).toHaveLength(2);
    expect(parseTeamMarks(nine, judges.slice(0, 1)).marks).toBeNull();
    expect(parseTeamMarks({ ...nine, extra: "9" }, [...judges, "extra"]).marks).toBeNull();
  });

  it("refuses half marks, 0 and anything over 10", () => {
    expect(parseTeamMarks({ carrie: "8", derek: "8.5" }, judges.slice(0, 2))).toMatchObject({ marks: null, invalidJudgeIds: ["derek"] });
    expect(parseTeamMarks({ carrie: "0", derek: "11" }, judges.slice(0, 2)).invalidJudgeIds).toEqual(["carrie", "derek"]);
  });
});

describe("parseSpecialPoints", () => {
  it("is complete only when every eligible participant has valid points, with 0 as a real entry", () => {
    expect(parseSpecialPoints({ a: "3", b: "0" }, ["a", "b"])).toEqual({ points: [{ coupleId: "a", points: 3 }, { coupleId: "b", points: 0 }], filled: 2, invalidCoupleIds: [] });
    expect(parseSpecialPoints({ a: "3" }, ["a", "b"])).toMatchObject({ points: null, filled: 1 });
    expect(parseSpecialPoints({ a: "3", b: "0.3" }, ["a", "b"])).toMatchObject({ points: null, invalidCoupleIds: ["b"] });
    expect(parseSpecialPoints({ a: "-1.5" }, ["a"]).points).toEqual([{ coupleId: "a", points: -1.5 }]);
    expect(parseSpecialPoints({}, []).points).toBeNull();
  });
});

describe("specialDanceComplete and specialDanceProgress", () => {
  const night = ["carrie", "derek", "bruno"];
  const marks = (ids: string[]) => ids.map((judgeId) => ({ judgeId, score: 9 }));

  it("judges a Marks dance against the night's judges, 2 to 4 of them", () => {
    const input = { marks: marks(night), scores: [], eligibleCoupleIds: ["a"], nightJudgeIds: night };
    expect(specialDanceComplete(team, input)).toBe(true);
    expect(specialDanceComplete(team, { ...input, marks: marks(night.slice(0, 2)) })).toBe(false);
    expect(specialDanceComplete(team, { ...input, marks: marks(["carrie"]), nightJudgeIds: ["carrie"] })).toBe(false);
    expect(specialDanceProgress(team, { ...input, marks: marks(night.slice(0, 2)) })).toMatchObject({ done: 2, total: 3, complete: false, label: "2 of 3 judges" });
    expect(specialDanceProgress({ ...team, postedAt: "2026-11-04T01:00:00Z" }, input).label).toBe("Posted");
  });

  it("judges a Points dance by its eligible participants", () => {
    const danceOff = { ...team, scoringMode: "points" as const };
    const scores = [
      { coupleId: "a", points: 3, result: "Winner" },
      { coupleId: "b", points: null, result: null },
    ];
    const input = { marks: [], scores, eligibleCoupleIds: ["a", "b"], nightJudgeIds: night };
    expect(specialDanceComplete(danceOff, input)).toBe(false);
    expect(specialDanceProgress(danceOff, input)).toMatchObject({ done: 1, total: 2, label: "1 of 2 points" });
    expect(specialDanceComplete(danceOff, { ...input, scores: [scores[0], { coupleId: "b", points: 0, result: "Loser" }] })).toBe(true);
    expect(specialDanceComplete(danceOff, { ...input, eligibleCoupleIds: [] })).toBe(false);
  });
});

describe("sameTeamMarks", () => {
  it("compares by judge, not by order", () => {
    const a = judges.map((judgeId) => ({ judgeId, score: 9 }));
    expect(sameTeamMarks(a, [...a].reverse())).toBe(true);
    expect(sameTeamMarks(a, a.map((m) => (m.judgeId === "derek" ? { ...m, score: 8 } : m)))).toBe(false);
    expect(sameTeamMarks(a, null)).toBe(false);
  });
});

describe("buildNightSummary", () => {
  it("adds Individual + Team into the night, scales to 30 through the engine, and tags Curtain Call's bands", () => {
    const rows = buildNightSummary([
      { coupleId: "julia", dances: [{ marks: [9, 8, 9, 8], label: null }, { marks: [9, 9, 9, 9], label: "Slaytopia" }] },
      { coupleId: "tatyana", dances: [{ marks: [8, 8, 9, 8], label: null }, { marks: [9, 9, 9, 9], label: "Slaytopia" }] },
      { coupleId: "jenna", dances: [{ marks: [9, 9, 9, 9], label: null }, { marks: [8, 8, 8, 8], label: "Wildcats" }] },
      { coupleId: "harry", dances: [{ marks: [7, 7, 8, 7], label: null }, { marks: [8, 8, 8, 8], label: "Wildcats" }] },
      { coupleId: "nobody", dances: [{ marks: [], label: null }] },
    ]);
    expect(rows.map((r) => [r.coupleId, r.nightTotal, r.maxPossible, r.danceCardPreview, r.tag])).toEqual([
      ["julia", 70, 80, 26.25, "top"],
      ["tatyana", 69, 80, 25.88, "within1"],
      ["jenna", 68, 80, 25.5, "within2"],
      ["harry", 61, 80, 22.88, null],
    ]);
    expect(rows[0]).toMatchObject({ individualTotal: 34, parts: [{ label: "Slaytopia", total: 36, bonus: false }] });
  });

  it("keeps a one-dance night on its plain 30-point basis", () => {
    expect(buildNightSummary([{ coupleId: "a", dances: [{ marks: [9, 9, 9], label: null }] }])[0]).toMatchObject({
      nightTotal: 27,
      maxPossible: 30,
      danceCardPreview: 27,
    });
  });

  it("adds a bonus round's points to the night but not to the max, so Dance Card can pass 30", () => {
    const [row] = buildNightSummary([
      {
        coupleId: "julia",
        dances: [
          { marks: [9, 8, 9, 8], label: null },
          { marks: [9, 9, 9, 9], label: "Slaytopia" },
          { marks: [], points: 3, label: "Dance-Off" },
        ],
      },
    ]);
    expect(row).toMatchObject({
      individualTotal: 34,
      parts: [
        { label: "Slaytopia", total: 36, bonus: false },
        { label: "Dance-Off", total: 3, bonus: true },
      ],
      nightTotal: 73,
      marksTotal: 70,
      bonusTotal: 3,
      maxPossible: 80,
      danceCardPreview: 27.38,
    });
    const [perfect] = buildNightSummary([{ coupleId: "a", dances: [{ marks: [10, 10, 10], label: null }, { marks: [], points: 3, label: "Dance-Off" }] }]);
    expect(perfect.danceCardPreview).toBe(33);
  });

  it("scores a special dance out of 10 a judge and ranks the bonus into the top-scorer bands", () => {
    const rows = buildNightSummary([
      { coupleId: "a", dances: [{ marks: [8, 8, 8], label: null }, { marks: [8, 7, 8], label: "Relay" }] },
      { coupleId: "b", dances: [{ marks: [8, 8, 8], label: null }, { marks: [], points: 2, label: "Dance-Off" }] },
    ]);
    expect(rows.map((r) => [r.coupleId, r.nightTotal, r.maxPossible, r.tag])).toEqual([
      ["a", 47, 60, "top"],
      ["b", 26, 30, null],
    ]);
  });
});

describe("validateSpecialDanceSetup", () => {
  const setup = (overrides: Partial<SpecialDanceSetupInput> = {}): SpecialDanceSetupInput => ({
    id: null,
    danceType: "Team Dance",
    name: "Slaytopia",
    memberCoupleIds: ["a", "b"],
    danceStyleId: "freestyle",
    secondDanceStyleId: null,
    songs: [{ title: "Zoo" }],
    scoringMode: "marks",
    details: [],
    sortOrder: 1,
    roundId: null,
    heatNumber: null,
    ...overrides,
  });
  const others = [{ id: "wildcats", name: "Wildcats" }];

  it("mirrors the RPC's invariants", () => {
    expect(validateSpecialDanceSetup(setup(), others)).toBeNull();
    expect(validateSpecialDanceSetup(setup({ danceType: " " }), others)).toMatch(/Dance Type/);
    expect(validateSpecialDanceSetup(setup({ memberCoupleIds: [] }), others)).toMatch(/at least one participant/);
    expect(validateSpecialDanceSetup(setup({ memberCoupleIds: ["a"] }), others)).toBeNull();
    expect(validateSpecialDanceSetup(setup({ name: "wildcats" }), others)).toMatch(/already called/);
    expect(validateSpecialDanceSetup(setup({ id: "wildcats", name: "Wildcats" }), others)).toBeNull();
    expect(validateSpecialDanceSetup(setup({ name: "" }), others)).toBeNull();
    expect(validateSpecialDanceSetup(setup({ songs: Array(5).fill({ title: "x" }) }), others)).toMatch(/up to 4 songs/);
    expect(validateSpecialDanceSetup(setup({ details: [{ label: " ", value: "x", coupleId: null }] }), others)).toMatch(/needs a label/);
  });
});

describe("oxfordJoin", () => {
  it("uses an Oxford comma", () => {
    expect(oxfordJoin([])).toBe("");
    expect(oxfordJoin(["Tatyana"])).toBe("Tatyana");
    expect(oxfordJoin(["Tatyana", "Jan"])).toBe("Tatyana and Jan");
    expect(oxfordJoin(["Tatyana", "Maura", "Amber", "Julia"])).toBe("Tatyana, Maura, Amber, and Julia");
  });
});

describe("automaticSpecialDanceName", () => {
  it("numbers a blank name by Dance Type, skipping names already on the night", () => {
    const others = [
      { id: "a", danceType: "Dance-Off", name: "Dance-Off" },
      { id: "b", danceType: "Dance-Off", name: "dance-off 2" },
    ];
    expect(automaticSpecialDanceName("Dance-Off", others, null)).toBe("Dance-Off 3");
    expect(automaticSpecialDanceName("Dance-Off", others, "b")).toBe("Dance-Off 2");
    expect(automaticSpecialDanceName("Relay", others, null)).toBe("Relay");
  });
});

describe("recentSuggestions", () => {
  it("keeps the built-ins first and adds used values newest first without repeats", () => {
    expect(
      recentSuggestions(
        ["Host", "Captain"],
        [
          { value: "Coach", updatedAt: "2026-10-01T00:00:00Z" },
          { value: "host", updatedAt: "2026-10-05T00:00:00Z" },
          { value: "Live Performer", updatedAt: "2026-10-03T00:00:00Z" },
          { value: " ", updatedAt: null },
          { value: "coach", updatedAt: null },
        ]
      )
    ).toEqual(["Host", "Captain", "Live Performer", "Coach"]);
  });
});

describe("specialDanceSummary and legacyTeamDefaults", () => {
  it("reads as style, songs and details", () => {
    const styles = new Map([["freestyle", "Freestyle"], ["jive", "Jive"]]);
    expect(specialDanceSummary(team, styles)).toBe('Freestyle · "Zoo" · Captain Tatyana · Host Alfonso Ribeiro');
    expect(
      specialDanceSummary(
        { ...team, secondDanceStyleId: "jive", songs: [{ title: "Zoo (Zootopia 2)" }, { title: "Try Everything" }], details: [] },
        styles
      )
    ).toBe('Freestyle & Jive · "Zoo (Zootopia 2)" · "Try Everything"');
  });

  it("fills a pre-migration team row as a Team Dance by marks with Captain and Host as details", () => {
    expect(legacyTeamDefaults({ songTitle: "Zoo", captainCoupleId: "tatyana", hostName: "Alfonso Ribeiro", captainName: "Tatyana" })).toEqual({
      nameIsAuto: false,
      danceType: "Team Dance",
      scoringMode: "marks",
      secondDanceStyleId: null,
      songs: [{ title: "Zoo" }],
      details: [
        { label: "Captain", value: "Tatyana", coupleId: "tatyana" },
        { label: "Host", value: "Alfonso Ribeiro", coupleId: null },
      ],
      updatedAt: null,
    });
  });
});

describe("eliminatedBeforeWeek", () => {
  it("filters couples already out before this week and keeps same-week or active ones", () => {
    expect(eliminatedBeforeWeek({ status: "eliminated", eliminationWeek: 7 }, 8)).toBe(true);
    expect(eliminatedBeforeWeek({ status: "eliminated", eliminationWeek: 8 }, 8)).toBe(false);
    expect(eliminatedBeforeWeek({ status: "active", eliminationWeek: null }, 8)).toBe(false);
    expect(eliminatedBeforeWeek({ status: "withdrawn", eliminationWeek: 7 }, 8)).toBe(false);
    expect(addableSpecialDanceParticipants(
      [
        { id: "a", status: "active", eliminationWeek: null },
        { id: "b", status: "eliminated", eliminationWeek: 7 },
        { id: "c", status: "eliminated", eliminationWeek: 8 },
        { id: "d", status: "withdrawn", eliminationWeek: 7 },
        { id: "e", status: "active", eliminationWeek: null },
      ],
      ["e"],
      8
    ).map((p) => p.id)).toEqual(["a", "c", "d"]);
  });
});

describe("eligibleTeamMembers", () => {
  it("mirrors team_eligible_members(): skips withdrawn, Did Not Dance, earlier eliminations and non-performers", () => {
    const result = eligibleTeamMembers(
      { memberCoupleIds: ["a", "b", "c", "d", "e", "f"] },
      [
        { coupleId: "a", status: "active", eliminationWeek: null, outcome: "safe" },
        { coupleId: "b", status: "active", eliminationWeek: null, outcome: "bye" },
        { coupleId: "c", status: "withdrawn", eliminationWeek: 7, outcome: null },
        { coupleId: "d", status: "eliminated", eliminationWeek: 7, outcome: null },
        { coupleId: "e", status: "eliminated", eliminationWeek: 8, outcome: "eliminated" },
        { coupleId: "f", status: "active", eliminationWeek: null, outcome: null },
      ],
      { weekNumber: 8, participantIds: ["a", "b", "c", "d", "e"] }
    );
    expect(result.eligible).toEqual(["a", "e"]);
    expect(result.skipped).toEqual([
      { coupleId: "b", reason: "bye" },
      { coupleId: "c", reason: "withdrawn" },
      { coupleId: "d", reason: "eliminated" },
      { coupleId: "f", reason: "not_performing" },
    ]);
  });
});
