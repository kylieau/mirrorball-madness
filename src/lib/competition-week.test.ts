import { describe, expect, it } from "vitest";
import {
  deriveWeekStatus,
  exhibitionEpisodes,
  groupEpisodesByWeek,
  liveCompetitionWeek,
  mergeCoupleOutcomes,
  weekTheme,
  type CompetitionWeekRow,
  type WeekEpisode,
} from "./competition-week";

const week1: CompetitionWeekRow = {
  id: "w1",
  week_number: 1,
  theme: "Premiere",
  is_elimination_week: false,
  is_double_elimination_week: false,
  is_finale: false,
};

const week2: CompetitionWeekRow = {
  id: "w2",
  week_number: 2,
  theme: null,
  is_elimination_week: true,
  is_double_elimination_week: false,
  is_finale: false,
};

function ep(partial: Partial<WeekEpisode> & Pick<WeekEpisode, "id" | "episode_number">): WeekEpisode {
  return {
    week_id: "w1",
    airs_at: "2026-09-16T00:00:00Z",
    theme: null,
    status: "upcoming",
    ...partial,
  };
}

describe("deriveWeekStatus", () => {
  it("is completed only when every assigned episode is completed", () => {
    expect(deriveWeekStatus([{ status: "completed" }, { status: "completed" }])).toBe("completed");
    expect(deriveWeekStatus([{ status: "completed" }, { status: "upcoming" }])).toBe("upcoming");
    expect(deriveWeekStatus([{ status: "completed" }, { status: "locked" }])).toBe("locked");
  });
});

describe("weekTheme", () => {
  it("prefers the week-level theme, then a single episode theme", () => {
    expect(weekTheme({ theme: "Premiere" }, [{ theme: "Night One" }])).toBe("Premiere");
    expect(weekTheme({ theme: null }, [{ theme: "Latin Night" }])).toBe("Latin Night");
    expect(weekTheme({ theme: null }, [{ theme: "Night One" }, { theme: "Night Two" }])).toBeNull();
  });
});

describe("groupEpisodesByWeek", () => {
  it("nests TV episodes under their week and omits exhibition rows", () => {
    const grouped = groupEpisodesByWeek(
      [week2, week1],
      [
        ep({ id: "e2", episode_number: 2, theme: "Night Two", airs_at: "2026-09-17T00:00:00Z", status: "upcoming" }),
        ep({ id: "e1", episode_number: 1, theme: "Night One", status: "completed" }),
        ep({ id: "e3", episode_number: 3, week_id: null, theme: "Interview" }),
        ep({
          id: "e4",
          episode_number: 4,
          week_id: "w2",
          theme: "Latin Night",
          airs_at: "2026-09-23T00:00:00Z",
          status: "upcoming",
        }),
      ]
    );

    expect(grouped.map((week) => week.week_number)).toEqual([1, 2]);
    expect(grouped[0].episodes.map((episode) => episode.id)).toEqual(["e1", "e2"]);
    expect(grouped[0].nightsLabel).toBe("Night One + Night Two");
    expect(grouped[0].theme).toBe("Premiere");
    expect(grouped[0].status).toBe("upcoming");
    expect(grouped[1].nightsLabel).toBeNull();
    expect(grouped[1].theme).toBe("Latin Night");
  });
});

describe("exhibitionEpisodes", () => {
  it("returns unassigned airings in TV order", () => {
    expect(
      exhibitionEpisodes([
        ep({ id: "e4", episode_number: 4, week_id: "w2" }),
        ep({ id: "e3", episode_number: 3, week_id: null, theme: "Interview" }),
      ]).map((episode) => episode.id)
    ).toEqual(["e3"]);
  });
});

describe("liveCompetitionWeek", () => {
  it("is the first week that is not fully completed", () => {
    expect(
      liveCompetitionWeek([
        { id: "w1", status: "completed" },
        { id: "w2", status: "upcoming" },
      ])?.id
    ).toBe("w2");
    expect(liveCompetitionWeek([{ id: "w1", status: "completed" }])).toBeNull();
  });
});

describe("mergeCoupleOutcomes", () => {
  it("keeps the more severe outcome when a couple appears on two nights", () => {
    expect(
      mergeCoupleOutcomes([
        { couple_id: "a", outcome: "safe" },
        { couple_id: "a", outcome: "eliminated" },
        { couple_id: "b", outcome: "safe" },
      ])
    ).toEqual([
      { couple_id: "a", outcome: "eliminated" },
      { couple_id: "b", outcome: "safe" },
    ]);
  });
});
