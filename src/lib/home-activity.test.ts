import { describe, expect, it } from "vitest";
import { activityScore, buildRecentActivity, type ActivityLine, type ActivityWeek } from "./home-activity";

const plain = (line: ActivityLine) => line.segments.map((seg) => seg.text).join("");

const week = (weekNumber: number, over: Partial<ActivityWeek> = {}): ActivityWeek => ({
  weekNumber,
  eliminated: [],
  scores: [],
  ...over,
});

describe("buildRecentActivity", () => {
  it("lists newest week first, eliminations before scores, scores newest first", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(1, { scores: [{ celebrity: "Sam", danceStyle: "Foxtrot", total: 20, at: "2026-09-16T00:09:00Z" }] }),
        week(2, {
          eliminated: ["Giada & Alan"],
          scores: [
            { celebrity: "Ava", danceStyle: "Waltz", total: 24, at: "2026-09-23T00:30:00Z" },
            { celebrity: "Ben", danceStyle: "Jive", total: 27, at: "2026-09-23T00:05:00Z" },
          ],
        }),
      ],
      westWeek: null,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual([
      "Giada & Alan eliminated",
      "Ava scored 24 on their Waltz",
      "Ben scored 27 on their Jive",
      "Sam scored 20 on their Foxtrot",
    ]);
    expect(lines.map((l) => l.weekLabel)).toEqual(["Week 2", "Week 2", "Week 2", "Week 1"]);
  });

  it("puts non-week lines first", () => {
    const lines = buildRecentActivity({
      weeks: [week(1, { eliminated: ["A & B"] })],
      westWeek: null,
      extraLines: [[{ text: "Pat", kind: "manager" }, { text: " joined " }, { text: "Friends", kind: "league" }]],
    });
    expect(plain(lines[0])).toBe("Pat joined Friends");
    expect(lines[0].weekLabel).toBeNull();
  });

  it("collapses the West-airing week's eliminations to one line and keeps its score posts", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(2, {
          eliminated: ["A & B"],
          scores: [{ celebrity: "Ava", danceStyle: "Waltz", total: 24, at: "2026-09-23T00:05:00Z" }],
          rankMoves: [{ league: "Alpha", mover: "Kim", passed: ["you"], place: 1 }],
        }),
        week(1, { eliminated: ["C & D"] }),
      ],
      westWeek: 2,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual(["Week 2 results are in", "Ava scored 24 on their Waltz", "C & D eliminated"]);
  });

  it("lists a week's overtakes after its eliminations and before its scores", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(9, {
          scores: [{ celebrity: "Amber", danceStyle: "Paso Doble", total: 27, at: "2026-11-11T01:20:00Z" }],
          rankMoves: [
            { league: "Alpha", mover: "You", passed: ["Kim"], place: 2 },
            { league: "Beta", mover: "Lee & Sam", passed: ["Pat", "Ro", "you"], place: 1 },
          ],
        }),
      ],
      westWeek: null,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual([
      "You overtook Kim for 2nd in Alpha",
      "Lee & Sam overtook Pat, Ro and you for 1st in Beta",
      "Amber scored 27 on their Paso Doble",
    ]);
    expect(lines[1].segments.filter((seg) => seg.kind === "manager").map((seg) => seg.text)).toEqual(["Lee & Sam", "Pat", "Ro", "you"]);
  });

  it("reads a bonus round in points as earned, signed, in the special dance's short name", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(8, {
          scores: [
            { celebrity: "Julia", danceStyle: "Dance-Off 1", total: 3, at: "2026-11-04T02:30:00Z", bonus: true },
            { celebrity: "Harry", danceStyle: "Dance-Off 1", total: -1.5, at: "2026-11-04T02:30:00Z", bonus: true },
            { celebrity: "Julia", danceStyle: "Freestyle", total: 36, at: "2026-11-04T02:00:00Z" },
          ],
        }),
      ],
      westWeek: null,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual(["Julia earned +3 in Dance-Off 1", "Harry earned −1.5 in Dance-Off 1", "Julia scored 36 on their Freestyle"]);
  });
});

describe("activityScore", () => {
  const row = { episode_id: "ep", couple_id: "c", total_score: 36, created_at: "2026-11-04T02:00:00Z", dance_styles: { name: "Freestyle" } };

  it("keeps a judged dance on its style and names a Points row by its special dance's short name", () => {
    expect(activityScore(row, "Julia", {})).toEqual({ celebrity: "Julia", danceStyle: "Freestyle", total: 36, at: row.created_at });
    expect(activityScore({ ...row, team_id: "t1", max_score: "40" }, "Julia", { t1: { name: "Slaytopia", danceType: "Team Dance" } })).toMatchObject({ danceStyle: "Freestyle" });
    expect(activityScore({ ...row, total_score: 3, team_id: "d1", max_score: 0 }, "Julia", { d1: { name: "Dance-Off 1", danceType: "Dance-Off" } })).toEqual({
      celebrity: "Julia",
      danceStyle: "Dance-Off 1",
      total: 3,
      at: row.created_at,
      bonus: true,
      immunity: false,
    });
    expect(activityScore({ ...row, total_score: 3, team_id: "d1", max_score: 0 }, "Julia", {}).danceStyle).toBe("a bonus round");
  });

  it("names an immunity row after the round and reads it as earned with", () => {
    const immune = activityScore({ ...row, total_score: 3, team_id: "i1", max_score: 0 }, "Harry", {
      i1: { name: "Dance-Off Immunity", danceType: "Immunity" },
    });
    expect(immune).toMatchObject({ danceStyle: "Dance-Off Immunity", immunity: true });
    const lines = buildRecentActivity({ weeks: [week(9, { scores: [immune] })], westWeek: null, extraLines: [] });
    expect(lines.map(plain)).toEqual(["Harry earned +3 with Dance-Off Immunity"]);
  });
});
