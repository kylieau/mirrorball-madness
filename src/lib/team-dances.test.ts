import { describe, expect, it } from "vitest";
import {
  appliedTeamMarks,
  automaticSpecialDanceName,
  oxfordJoin,
  buildNightSummary,
  eligibleTeamMembers,
  inferTeamsFromRows,
  isHalfStep,
  isTeamDanceRow,
  isTeamStyleName,
  isValidMark,
  isValidMarkMax,
  isValidPoints,
  legacyTeamDefaults,
  markInputError,
  markRangeMessage,
  MARK_MIN,
  parseSpecialPoints,
  parseTeamMarks,
  recentSuggestions,
  sameTeamMarks,
  specialDanceComplete,
  specialDanceProgress,
  specialDanceSummary,
  teamApplyPlan,
  addableSpecialDanceParticipants,
  eliminatedBeforeWeek,
  validateSpecialDanceSetup,
  type SpecialDance,
  type SpecialDanceSetupInput,
  type TeamMemberInput,
} from "./team-dances";

const judges = ["carrie", "derek", "bruno", "cynthia"];
const team: SpecialDance = {
  id: "slaytopia",
  episodeId: "ep",
  name: "Slaytopia",
  nameIsAuto: false,
  danceType: "Team Dance",
  scoringMode: "marks",
  markMax: 10,
  panelJudgeIds: null,
  danceStyleId: "freestyle",
  secondDanceStyleId: null,
  songs: [{ title: "Zoo", artist: null }],
  songTitle: "Zoo",
  songSource: "Zootopia 2",
  themeLabel: "Film",
  details: [
    { label: "Captain", value: "Tatyana", coupleId: "tatyana" },
    { label: "Host", value: "Alfonso Ribeiro", coupleId: null },
  ],
  captainCoupleId: "tatyana",
  hostName: "Alfonso Ribeiro",
  sortOrder: 1,
  memberCoupleIds: ["tatyana", "maura", "amber", "julia"],
  inferred: false,
  postedAt: null,
  updatedAt: null,
};
const nine = Object.fromEntries(judges.map((j) => [j, "9"]));
const member = (coupleId: string, overrides: Partial<TeamMemberInput> = {}): TeamMemberInput => ({
  coupleId,
  status: "active",
  eliminationWeek: null,
  outcome: "safe",
  dances: [{ danceStyleId: "contemporary", songTitle: "Easy as Life", scores: { carrie: "8", derek: "8", bruno: "9", cynthia: "8" } }],
  posted: false,
  liveDances: [],
  ...overrides,
});
const opts = { weekNumber: 8, participantIds: [], judgeIds: judges };

describe("mark and point ranges", () => {
  it("accepts half steps only", () => {
    expect(isHalfStep(7.5)).toBe(true);
    expect(isHalfStep(7.25)).toBe(false);
    expect(isHalfStep(Number.NaN)).toBe(false);
  });

  it("checks a mark against the dance's own per-judge max", () => {
    expect(isValidMark(10, 10)).toBe(true);
    expect(isValidMark(8.5, 8)).toBe(false);
    expect(isValidMark(8, 8)).toBe(true);
    expect(isValidMark(-0.5, 10)).toBe(false);
    expect(isValidMark(0, 10)).toBe(false);
    expect(isValidMark(MARK_MIN, 10)).toBe(true);
    expect(isValidMark(0.5, 10)).toBe(false);
  });

  it("shows a visible range error for 0, off-step, and over-max values", () => {
    expect(markRangeMessage(10)).toBe("Judge scores must be 1 to 10 in steps of 0.5");
    expect(markInputError("", 10)).toBeNull();
    expect(markInputError("8", 10)).toBeNull();
    expect(markInputError("0", 10)).toBe(markRangeMessage(10));
    expect(markInputError("10.5", 10)).toBe(markRangeMessage(10));
    expect(markInputError("11", 10)).toBe(markRangeMessage(10));
    expect(markInputError("0.25", 10)).toBe(markRangeMessage(10));
  });

  it("limits the per-judge max to 1 to 10 in half steps", () => {
    expect([0.5, 1, 7.5, 10].map(isValidMarkMax)).toEqual([true, true, true, true]);
    expect([0, 10.5, 11, 7.25].map(isValidMarkMax)).toEqual([false, false, false, false]);
  });

  it("allows negative points in half steps within the limit", () => {
    expect([3, -1.5, 0, 100, -100].map(isValidPoints)).toEqual([true, true, true, true, true]);
    expect([100.5, 0.25, Number.NaN].map(isValidPoints)).toEqual([false, false, false]);
  });
});

describe("parseTeamMarks", () => {
  it("is complete only when every judge on the panel holds a mark from 1 to the max", () => {
    expect(parseTeamMarks({ carrie: "9", derek: "9", bruno: "9" }, judges)).toMatchObject({ marks: null, filled: 3, invalidJudgeIds: [] });
    expect(parseTeamMarks({ ...nine, derek: "11" }, judges)).toMatchObject({ marks: null, filled: 4, invalidJudgeIds: ["derek"] });
    expect(parseTeamMarks({ ...nine, derek: "x" }, judges).invalidJudgeIds).toEqual(["derek"]);
    expect(parseTeamMarks(nine, judges).marks).toEqual(judges.map((judgeId) => ({ judgeId, score: 9 })));
    expect(parseTeamMarks({ ...nine, cynthia: " 9.5 " }, judges).marks?.find((m) => m.judgeId === "cynthia")?.score).toBe(9.5);
  });

  it("completes on two or three judges, never on one or five", () => {
    expect(parseTeamMarks(nine, judges.slice(0, 3)).marks).toHaveLength(3);
    expect(parseTeamMarks(nine, judges.slice(0, 2)).marks).toHaveLength(2);
    expect(parseTeamMarks(nine, judges.slice(0, 1)).marks).toBeNull();
    expect(parseTeamMarks({ ...nine, extra: "9" }, [...judges, "extra"]).marks).toBeNull();
  });

  it("holds marks to the dance's own max and to half steps", () => {
    expect(parseTeamMarks({ carrie: "8", derek: "8.5" }, judges.slice(0, 2), 8)).toMatchObject({ marks: null, invalidJudgeIds: ["derek"] });
    expect(parseTeamMarks({ carrie: "7.25", derek: "8" }, judges.slice(0, 2), 8).invalidJudgeIds).toEqual(["carrie"]);
    expect(parseTeamMarks({ carrie: "8", derek: "7.5" }, judges.slice(0, 2), 8).marks).toEqual([
      { judgeId: "carrie", score: 8 },
      { judgeId: "derek", score: 7.5 },
    ]);
    expect(parseTeamMarks({ carrie: "0", derek: "8" }, judges.slice(0, 2)).invalidJudgeIds).toEqual(["carrie"]);
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

  it("judges a Marks dance against its own panel, else the night's", () => {
    const input = { marks: marks(night), scores: [], eligibleCoupleIds: ["a"], nightJudgeIds: night };
    expect(specialDanceComplete(team, input)).toBe(true);
    expect(specialDanceComplete(team, { ...input, marks: marks(night.slice(0, 2)) })).toBe(false);
    expect(specialDanceComplete({ ...team, panelJudgeIds: ["carrie", "derek"] }, { ...input, marks: marks(["carrie", "derek"]) })).toBe(true);
    expect(specialDanceComplete({ ...team, panelJudgeIds: ["carrie"] }, { ...input, marks: marks(["carrie"]) })).toBe(false);
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

describe("isTeamDanceRow", () => {
  it("matches the team's style and song, ignoring case, surrounding whitespace and null vs empty", () => {
    expect(isTeamDanceRow(team, { danceStyleId: "freestyle", songTitle: " zoo " })).toBe(true);
    expect(isTeamDanceRow(team, { danceStyleId: "freestyle", songTitle: "Try Everything" })).toBe(false);
    expect(isTeamDanceRow(team, { danceStyleId: "contemporary", songTitle: "Zoo" })).toBe(false);
    expect(isTeamDanceRow({ ...team, songTitle: null }, { danceStyleId: "freestyle", songTitle: "" })).toBe(true);
  });
});

describe("teamApplyPlan", () => {
  it("mirrors the RPC: applies to members with exactly one other dance, skips withdrawn and bye, flags collisions", () => {
    const plan = teamApplyPlan(
      team,
      [
        member("tatyana"),
        member("maura", { outcome: "bye" }),
        member("amber", { status: "withdrawn" }),
        member("julia", { dances: [] }),
      ],
      opts
    );
    expect(plan.map((p) => [p.coupleId, p.state, p.reason])).toEqual([
      ["tatyana", "will_apply", null],
      ["maura", "skipped", "bye"],
      ["amber", "skipped", "withdrawn"],
      ["julia", "collision", null],
    ]);
    expect(plan[3].otherDances).toBe(0);
  });

  it("skips a couple eliminated before this week but not one eliminated on the night itself", () => {
    const plan = teamApplyPlan(
      team,
      [
        member("tatyana", { status: "eliminated", eliminationWeek: 7 }),
        member("maura", { status: "eliminated", eliminationWeek: 8 }),
      ],
      opts
    );
    expect(plan.map((p) => p.state)).toEqual(["skipped", "will_apply"]);
  });

  it("honours a restricted Who's Performing list", () => {
    const plan = teamApplyPlan(team, [member("tatyana"), member("maura")], { ...opts, participantIds: ["tatyana"] });
    expect(plan.map((p) => [p.state, p.reason])).toEqual([["will_apply", null], ["skipped", "not_performing"]]);
  });

  it("reads applied marks from the team row and tells a posted member with the team dance live from one without", () => {
    const teamRow = { danceStyleId: "freestyle", songTitle: "Zoo", scores: nine };
    const plan = teamApplyPlan(
      team,
      [
        member("tatyana", { dances: [...member("x").dances, teamRow] }),
        member("maura", { posted: true }),
        member("amber", { posted: true, dances: [...member("x").dances, teamRow], liveDances: [{ danceStyleId: "contemporary", songTitle: "Easy as Life", totalScore: 33 }] }),
        member("julia", {
          posted: true,
          dances: [...member("x").dances, teamRow],
          liveDances: [{ danceStyleId: "contemporary", songTitle: "Easy as Life", totalScore: 33 }, { danceStyleId: "freestyle", songTitle: "Zoo", totalScore: 36 }],
        }),
      ],
      opts
    );
    expect(plan.map((p) => p.state)).toEqual(["applied", "posted_waiting", "posted_waiting", "posted_applied"]);
    expect(plan[3].liveTeamTotal).toBe(36);
    expect(appliedTeamMarks(plan)).toEqual({ marks: judges.map((judgeId) => ({ judgeId, score: 9 })), mismatch: false });
    const edited = { ...teamRow, scores: { ...nine, derek: "8" } };
    expect(appliedTeamMarks(teamApplyPlan(team, [member("tatyana", { dances: [...member("x").dances, teamRow] }), member("maura", { dances: [...member("x").dances, edited] })], opts)).mismatch).toBe(true);
  });

  it("treats a second team-signature row as a collision instead of guessing", () => {
    const teamRow = { danceStyleId: "freestyle", songTitle: "Zoo", scores: nine };
    const plan = teamApplyPlan(team, [member("tatyana", { dances: [...member("x").dances, teamRow, teamRow] })], opts);
    expect(plan[0].state).toBe("collision");
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

  it("scores a special dance on its own per-judge max and ranks the bonus into the top-scorer bands", () => {
    const rows = buildNightSummary([
      { coupleId: "a", dances: [{ marks: [8, 8, 8], label: null }, { marks: [8, 7.5, 8], markMax: 8, label: "Relay" }] },
      { coupleId: "b", dances: [{ marks: [8, 8, 8], label: null }, { marks: [], points: 2, label: "Dance-Off" }] },
    ]);
    expect(rows.map((r) => [r.coupleId, r.nightTotal, r.maxPossible, r.tag])).toEqual([
      ["a", 47.5, 54, "top"],
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
    songs: [{ title: "Zoo", artist: null }],
    scoringMode: "marks",
    markMax: 10,
    panelJudgeIds: null,
    songSource: null,
    themeLabel: null,
    details: [],
    sortOrder: 1,
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
    expect(validateSpecialDanceSetup(setup({ songs: Array(5).fill({ title: "x", artist: null }) }), others)).toMatch(/up to 4 songs/);
    expect(validateSpecialDanceSetup(setup({ details: [{ label: " ", value: "x", coupleId: null }] }), others)).toMatch(/needs a label/);
    expect(validateSpecialDanceSetup(setup({ markMax: 10.5 }), others)).toMatch(/Out of/);
    expect(validateSpecialDanceSetup(setup({ panelJudgeIds: ["carrie"] }), others)).toMatch(/2 to 4 judges/);
    expect(validateSpecialDanceSetup(setup({ scoringMode: "points", markMax: 0, panelJudgeIds: ["carrie"] }), others)).toBeNull();
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
  it("reads as style, songs, source, and details", () => {
    const styles = new Map([["freestyle", "Freestyle"], ["jive", "Jive"]]);
    expect(specialDanceSummary(team, styles)).toBe('Freestyle · "Zoo" · Zootopia 2 · Captain Tatyana · Host Alfonso Ribeiro');
    expect(
      specialDanceSummary(
        { ...team, secondDanceStyleId: "jive", songs: [{ title: "Zoo", artist: "Shakira" }, { title: "Try Everything", artist: null }], songSource: null, details: [] },
        styles
      )
    ).toBe('Freestyle & Jive · "Zoo" by Shakira · "Try Everything"');
  });

  it("fills a pre-migration team row as a Team Dance by marks out of 10 with Captain and Host as details", () => {
    expect(legacyTeamDefaults({ songTitle: "Zoo", captainCoupleId: "tatyana", hostName: "Alfonso Ribeiro", captainName: "Tatyana" })).toEqual({
      nameIsAuto: false,
      danceType: "Team Dance",
      scoringMode: "marks",
      markMax: 10,
      panelJudgeIds: null,
      secondDanceStyleId: null,
      songs: [{ title: "Zoo", artist: null }],
      themeLabel: null,
      details: [
        { label: "Captain", value: "Tatyana", coupleId: "tatyana" },
        { label: "Host", value: "Alfonso Ribeiro", coupleId: null },
      ],
      updatedAt: null,
    });
  });
});

describe("inferTeamsFromRows", () => {
  const styles = new Set(["freestyle"]);
  const row = (danceStyleId: string, songTitle: string | null) => ({ danceStyleId, songTitle });
  it("reads the live Week 8 shape: couples whose second slot shares a Freestyle and song form a team", () => {
    const teams = inferTeamsFromRows(
      "ep",
      [
        { coupleId: "tatyana", dances: [row("contemporary", "Easy as Life"), row("freestyle", "Zoo")] },
        { coupleId: "maura", dances: [row("jive", "Hakuna Matata"), row("freestyle", "zoo ")] },
        { coupleId: "connor", dances: [row("freestyle", "We're All in This Together"), row("quickstep", "Go the Distance")] },
        { coupleId: "ezra", dances: [row("freestyle", "We're All in This Together")] },
        { coupleId: "harry", dances: [row("freestyle", "Solo Freestyle")] },
        { coupleId: "jenna", dances: [row("waltz", "Zoo")] },
      ],
      styles
    );
    expect(teams.map((t) => [t.name, t.songTitle, t.memberCoupleIds, t.inferred, t.captainCoupleId])).toEqual([
      ["Slaytopia", "Zoo", ["tatyana", "maura"], true, null],
      ["Wildcats", "We're All in This Together", ["connor", "ezra"], true, null],
    ]);
    expect(teams[0].id).toMatch(/^inferred:/);
    expect(teams[0]).toMatchObject({ danceStyleId: "freestyle", danceType: "Team Dance", scoringMode: "marks", markMax: 10, songs: [{ title: "Zoo", artist: null }] });
  });

  it("names an unknown song's team after the song", () => {
    const [team] = inferTeamsFromRows("ep", [{ coupleId: "a", dances: [row("freestyle", "Try Everything")] }, { coupleId: "b", dances: [row("freestyle", "Try Everything")] }], styles);
    expect(team.name).toBe("Try Everything");
  });

  it("ignores styles that are not team styles and needs two couples", () => {
    expect(inferTeamsFromRows("ep", [{ coupleId: "a", dances: [row("freestyle", "Zoo")] }], styles)).toEqual([]);
    expect(inferTeamsFromRows("ep", [{ coupleId: "a", dances: [row("waltz", "Zoo")] }, { coupleId: "b", dances: [row("waltz", "Zoo")] }], styles)).toEqual([]);
    expect(isTeamStyleName("Team Freestyle")).toBe(true);
    expect(isTeamStyleName("Waltz")).toBe(false);
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
