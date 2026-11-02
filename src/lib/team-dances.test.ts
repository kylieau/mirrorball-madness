import { describe, expect, it } from "vitest";
import {
  appliedTeamMarks,
  buildNightSummary,
  eligibleTeamMembers,
  inferTeamsFromRows,
  isTeamDanceRow,
  isTeamStyleName,
  parseTeamMarks,
  sameTeamMarks,
  teamApplyPlan,
  validateTeamSetup,
  type EpisodeTeam,
  type TeamMemberInput,
} from "./team-dances";

const judges = ["carrie", "derek", "bruno", "cynthia"];
const team: EpisodeTeam = {
  id: "slaytopia",
  episodeId: "ep",
  name: "Slaytopia",
  songTitle: "Zoo",
  songSource: "Zootopia 2",
  danceStyleId: "freestyle",
  captainCoupleId: "tatyana",
  hostName: "Alfonso Ribeiro",
  sortOrder: 1,
  memberCoupleIds: ["tatyana", "maura", "amber", "julia"],
  inferred: false,
  postedAt: null,
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

describe("parseTeamMarks", () => {
  it("is complete only when all four judges hold a mark from 0 to 10", () => {
    expect(parseTeamMarks({ carrie: "9", derek: "9", bruno: "9" }, judges)).toMatchObject({ marks: null, filled: 3, invalidJudgeIds: [] });
    expect(parseTeamMarks({ ...nine, derek: "11" }, judges)).toMatchObject({ marks: null, filled: 4, invalidJudgeIds: ["derek"] });
    expect(parseTeamMarks({ ...nine, derek: "x" }, judges).invalidJudgeIds).toEqual(["derek"]);
    expect(parseTeamMarks(nine, judges).marks).toEqual(judges.map((judgeId) => ({ judgeId, score: 9 })));
    expect(parseTeamMarks({ ...nine, cynthia: " 9.5 " }, judges).marks?.find((m) => m.judgeId === "cynthia")?.score).toBe(9.5);
  });

  it("never completes on a three- or five-judge panel", () => {
    expect(parseTeamMarks(nine, judges.slice(0, 3)).marks).toBeNull();
    expect(parseTeamMarks({ ...nine, extra: "9" }, [...judges, "extra"]).marks).toBeNull();
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
      { coupleId: "julia", dances: [{ marks: [9, 8, 9, 8], teamName: null }, { marks: [9, 9, 9, 9], teamName: "Slaytopia" }] },
      { coupleId: "tatyana", dances: [{ marks: [8, 8, 9, 8], teamName: null }, { marks: [9, 9, 9, 9], teamName: "Slaytopia" }] },
      { coupleId: "jenna", dances: [{ marks: [9, 9, 9, 9], teamName: null }, { marks: [8, 8, 8, 8], teamName: "Wildcats" }] },
      { coupleId: "harry", dances: [{ marks: [7, 7, 8, 7], teamName: null }, { marks: [8, 8, 8, 8], teamName: "Wildcats" }] },
      { coupleId: "nobody", dances: [{ marks: [], teamName: null }] },
    ]);
    expect(rows.map((r) => [r.coupleId, r.nightTotal, r.maxPossible, r.danceCardPreview, r.tag])).toEqual([
      ["julia", 70, 80, 26.25, "top"],
      ["tatyana", 69, 80, 25.88, "within1"],
      ["jenna", 68, 80, 25.5, "within2"],
      ["harry", 61, 80, 22.88, null],
    ]);
    expect(rows[0]).toMatchObject({ individualTotal: 34, teamParts: [{ teamName: "Slaytopia", total: 36 }] });
  });

  it("keeps a one-dance night on its plain 30-point basis", () => {
    expect(buildNightSummary([{ coupleId: "a", dances: [{ marks: [9, 9, 9], teamName: null }] }])[0]).toMatchObject({
      nightTotal: 27,
      maxPossible: 30,
      danceCardPreview: 27,
    });
  });
});

describe("validateTeamSetup", () => {
  const setup = (overrides = {}) => ({
    id: null,
    name: "Slaytopia",
    songTitle: "Zoo",
    songSource: null,
    danceStyleId: "freestyle",
    captainCoupleId: "a",
    hostName: null,
    sortOrder: 1,
    memberCoupleIds: ["a", "b"],
    ...overrides,
  });
  it("mirrors the RPC's invariants", () => {
    expect(validateTeamSetup([setup()])).toBeNull();
    expect(validateTeamSetup([setup({ name: " " })])).toMatch(/needs a name/);
    expect(validateTeamSetup([setup(), setup({ name: "slaytopia", memberCoupleIds: ["c", "d"], captainCoupleId: null })])).toMatch(/both called/);
    expect(validateTeamSetup([setup({ memberCoupleIds: ["a"] })])).toMatch(/at least two/);
    expect(validateTeamSetup([setup(), setup({ name: "Wildcats", memberCoupleIds: ["b", "c"], captainCoupleId: null })])).toMatch(/only one team/);
    expect(validateTeamSetup([setup({ captainCoupleId: "z" })])).toMatch(/captain/);
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
    expect(teams[0].danceStyleId).toBe("freestyle");
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
