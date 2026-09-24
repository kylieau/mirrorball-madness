import { describe, expect, it } from "vitest";
import { buildRecentActivity, type ActivityLine, type ActivityWeek } from "./home-activity";

const plain = (line: ActivityLine) => line.segments.map((seg) => seg.text).join("");

const week = (weekNumber: number, over: Partial<ActivityWeek> = {}): ActivityWeek => ({
  weekNumber,
  eliminated: [],
  scores: [],
  ...over,
});

describe("buildRecentActivity", () => {
  it("lists newest week first, eliminations before scores, scores high to low", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(1, { scores: [{ celebrity: "Sam", danceStyle: "Foxtrot", total: 20 }] }),
        week(2, {
          eliminated: ["Giada & Alan"],
          scores: [
            { celebrity: "Ava", danceStyle: "Waltz", total: 24 },
            { celebrity: "Ben", danceStyle: "Jive", total: 27 },
          ],
        }),
      ],
      westWeek: null,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual([
      "Giada & Alan eliminated",
      "Ben scored 27 on their Jive",
      "Ava scored 24 on their Waltz",
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

  it("collapses the West-airing week to one results-are-in line", () => {
    const lines = buildRecentActivity({
      weeks: [
        week(2, { eliminated: ["A & B"], scores: [{ celebrity: "Ava", danceStyle: "Waltz", total: 24 }] }),
        week(1, { eliminated: ["C & D"] }),
      ],
      westWeek: 2,
      extraLines: [],
    });
    expect(lines.map(plain)).toEqual(["Week 2 results are in", "C & D eliminated"]);
  });
});
