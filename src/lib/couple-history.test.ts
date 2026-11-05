import { describe, expect, it } from "vitest";
import { buildCoupleHistory as build, unwatchedRange, type CoupleHistoryDanceRow } from "./couple-history";
import { collapseToNights } from "./scoring";

const dance = (over: Partial<CoupleHistoryDanceRow> & { id: string; episodeId: string }): CoupleHistoryDanceRow => ({
  coupleId: "amber",
  style: "Jive",
  song: null,
  totalScore: 27,
  scaledScore: 27,
  maxScore: null,
  teamId: null,
  ...over,
});

const base = {
  coupleId: "amber",
  marks: [],
  outcomes: [],
  inJeopardyEpisodeIds: new Set<string>(),
  teamDanceEpisodes: new Set<string>(),
  labels: new Map(),
};

// The couple's own rows double as the episode's unless a test passes others.
const buildCoupleHistory = (input: Omit<Parameters<typeof build>[0], "episodeDances"> & { episodeDances?: Parameters<typeof build>[0]["episodeDances"] }) =>
  build({ ...input, episodeDances: input.episodeDances ?? input.dances });

describe("buildCoupleHistory", () => {
  it("lists weeks newest first and drops rows outside the weeks it is given", () => {
    const history = buildCoupleHistory({
      ...base,
      weeks: [
        { weekNumber: 6, theme: "Hair Metal", episodeIds: ["e6"], mode: "results" },
        { weekNumber: 7, theme: null, episodeIds: ["e7"], mode: "results" },
      ],
      dances: [
        dance({ id: "d6", episodeId: "e6", totalScore: 22, scaledScore: 22 }),
        dance({ id: "d7", episodeId: "e7", totalScore: 26, scaledScore: 26 }),
        dance({ id: "d8", episodeId: "e8", totalScore: 30, scaledScore: 30 }),
      ],
      outcomes: [
        { episode_id: "e6", couple_id: "amber", outcome: "safe" },
        { episode_id: "e8", couple_id: "amber", outcome: "eliminated" },
      ],
    });
    expect(history.weeks.map((w) => w.weekNumber)).toEqual([7, 6]);
    expect(history.weeks.flatMap((w) => w.nights.flatMap((n) => n.dances.map((d) => d.id)))).toEqual(["d7", "d6"]);
    expect(history.danceCount).toBe(2);
    expect(history.best).toEqual({ scaled: 26, weekNumber: 7 });
    expect(history.average).toBe(24);
  });

  it("gives a week still being revealed no outcome or In Jeopardy", () => {
    const history = buildCoupleHistory({
      ...base,
      weeks: [{ weekNumber: 9, theme: "Grammy Night", episodeIds: ["e9"], mode: "scores" }],
      dances: [dance({ id: "d9", episodeId: "e9" })],
      outcomes: [{ episode_id: "e9", couple_id: "amber", outcome: "eliminated" }],
      inJeopardyEpisodeIds: new Set(["e9"]),
    });
    expect(history.weeks[0]).toMatchObject({ mode: "scores", outcome: null, inJeopardy: false });
    expect(history.jeopardyWeeks).toEqual([]);
  });

  it("pays a night with a special dance and a bonus as collapseToNights does", () => {
    const rows = [
      dance({ id: "own", episodeId: "e8", totalScore: 28, scaledScore: 28 }),
      dance({ id: "team", episodeId: "e8", style: "Freestyle", totalScore: 36, scaledScore: 27, maxScore: 40, teamId: "t1" }),
      dance({ id: "off", episodeId: "e8", totalScore: 3, scaledScore: 3, maxScore: 0, teamId: "t2" }),
    ];
    const history = buildCoupleHistory({
      ...base,
      weeks: [{ weekNumber: 8, theme: null, episodeIds: ["e8"], mode: "results" }],
      dances: rows,
      labels: new Map([
        ["t1", { name: "Slaytopia", danceType: "Team Dance" }],
        ["t2", { name: "Dance-Off 1", danceType: "Dance-Off", scoringMode: "points" as const }],
      ]),
    });
    const [night] = history.weeks[0].nights;
    const [expected] = collapseToNights(rows);
    expect(night.combined).toEqual({ total: 67, max: expected.maxScore, scaled: expected.scaledScore });
    expect(night.dances.map((d) => [d.label, d.bonus])).toEqual([
      ["Jive", false],
      ["Team Dance · Slaytopia", false],
      ["Dance-Off", true],
    ]);
    expect(history.danceCount).toBe(2);
  });

  it("keeps two nights in one week apart and shows a one-dance night without a combined line", () => {
    const history = buildCoupleHistory({
      ...base,
      weeks: [{ weekNumber: 3, theme: null, episodeIds: ["a", "b"], mode: "results" }],
      dances: [
        dance({ id: "da", episodeId: "a", totalScore: 36, scaledScore: 27, maxScore: 40 }),
        dance({ id: "db", episodeId: "b", totalScore: 24, scaledScore: 24 }),
      ],
    });
    expect(history.weeks[0].nights.map((n) => [n.episodeId, n.combined, n.scaled])).toEqual([
      ["a", null, 27],
      ["b", null, 24],
    ]);
  });

  it("keeps a week with an outcome but no dance, and orders marks by judge", () => {
    const history = buildCoupleHistory({
      ...base,
      weeks: [
        { weekNumber: 5, theme: null, episodeIds: ["e5"], mode: "results" },
        { weekNumber: 4, theme: null, episodeIds: ["e4"], mode: "results" },
      ],
      dances: [dance({ id: "d4", episodeId: "e4" })],
      marks: [
        { danceId: "d4", judge: "Derek", score: 9 },
        { danceId: "d4", judge: "Bruno", score: 9 },
        { danceId: "d4", judge: "Carrie Ann", score: 9 },
      ],
      outcomes: [{ episode_id: "e5", couple_id: "amber", outcome: "bye" }],
      inJeopardyEpisodeIds: new Set(["e4"]),
    });
    expect(history.weeks.map((w) => [w.weekNumber, w.outcome, w.nights.length])).toEqual([
      [5, "bye", 0],
      [4, null, 1],
    ]);
    expect(history.weeks[1].nights[0].dances[0].marks.map((m) => m.judge)).toEqual(["Bruno", "Carrie Ann", "Derek"]);
    expect(history.jeopardyWeeks).toEqual([4]);
  });
});

describe("buildCoupleHistory night panel", () => {
  it("takes a bonus-only night's panel from the whole episode, as scoring does", () => {
    const own = dance({ id: "off", episodeId: "e10", totalScore: 3, scaledScore: 3, maxScore: 0, teamId: "t1" });
    const others = [
      { episodeId: "e10", coupleId: "harry", totalScore: 36, scaledScore: 27, maxScore: 40 },
      { episodeId: "e10", coupleId: "ezra", totalScore: 32, scaledScore: 24, maxScore: 40 },
    ];
    const history = buildCoupleHistory({
      ...base,
      weeks: [{ weekNumber: 9, theme: null, episodeIds: ["e10"], mode: "results" }],
      dances: [own],
      episodeDances: [own, ...others],
    });
    expect(history.weeks[0].nights[0].scaled).toBe(collapseToNights([own, ...others]).find((n) => n.coupleId === "amber")!.scaledScore);
    expect(history.weeks[0].nights[0].scaled).toBe(2.25);
  });
});

describe("unwatchedRange", () => {
  it("is the season's unwatched completed weeks, or nothing when caught up", () => {
    expect(unwatchedRange(6, 8)).toEqual({ from: 7, to: 8 });
    expect(unwatchedRange(8, 8)).toBeNull();
    expect(unwatchedRange(0, null)).toBeNull();
  });
});
