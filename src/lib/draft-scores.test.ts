import { describe, expect, it } from "vitest";
import {
  DRAFT_SCORES_SHEET,
  DRAFT_SCORES_STRIP_LABEL,
  draftScoresVisible,
  draftWeekManagerScores,
  findDraftRelease,
  homeStripChoice,
  postingWeekNumber,
  replaceWeekDanceScores,
  scoresReplacingDraftWeek,
} from "./draft-scores";

const weeks = new Map([
  ["w2", 2],
  ["w3", 3],
]);

describe("findDraftRelease", () => {
  it("picks the earliest unpublished night with a released draft", () => {
    const release = findDraftRelease(
      [
        { id: "e3", week_id: "w3", results_published_at: null, scores_drafted_at: "t" },
        { id: "e2", week_id: "w2", results_published_at: null, scores_drafted_at: "t" },
        { id: "e2b", week_id: "w2", results_published_at: null, scores_drafted_at: "t" },
        { id: "published", week_id: "w2", results_published_at: "t", scores_drafted_at: "t" },
        { id: "unreleased", week_id: "w3", results_published_at: null, scores_drafted_at: null },
      ],
      weeks
    );
    expect(release).toEqual({ weekId: "w2", weekNumber: 2, episodeIds: ["e2", "e2b"] });
  });

  it("ignores a night that is not a competition week", () => {
    expect(
      findDraftRelease([{ id: "ex", week_id: null, results_published_at: null, scores_drafted_at: "t" }], weeks)
    ).toBeNull();
  });
});

describe("draft visibility", () => {
  it("requires the Mark Watched unlock, not merely having watched live", () => {
    expect(draftScoresVisible(0, 3)).toBe(false);
    expect(draftScoresVisible(2, 3)).toBe(false);
    expect(draftScoresVisible(3, 3)).toBe(true);
  });

  it("offers the prompt week for a released draft before any live post", () => {
    expect(postingWeekNumber({ lastWatchedWeek: 2, revealingWeekNumber: null, draftReleaseWeekNumber: 3 })).toBe(3);
    expect(postingWeekNumber({ lastWatchedWeek: 3, revealingWeekNumber: null, draftReleaseWeekNumber: 3 })).toBeNull();
  });

  it("keeps a live reveal ahead of a later draft when the viewer is behind", () => {
    expect(postingWeekNumber({ lastWatchedWeek: 1, revealingWeekNumber: 2, draftReleaseWeekNumber: 3 })).toBe(2);
  });
});

describe("homeStripChoice", () => {
  it("replaces the spoiler-free strip while drafts are visible", () => {
    expect(homeStripChoice(true, true)).toBe("draft");
    expect(homeStripChoice(false, true)).toBe("spoiler-free");
    expect(homeStripChoice(false, false)).toBe("none");
  });
});

describe("draft week points", () => {
  it("pays judges points only and replaces that week's stored total", () => {
    const managers = draftWeekManagerScores({
      weekNumber: 3,
      anchorWeek: 1,
      judgesScoreMultiplier: 0.5,
      judgesCategoryWeight: 2,
      rosterSlots: [
        { managerId: "a", coupleId: "c1" },
        { managerId: "b", coupleId: "c2" },
      ],
      danceScores: [
        { coupleId: "c1", totalScore: 20 },
        { coupleId: "c1", totalScore: 10 },
        { coupleId: "c2", totalScore: 18 },
      ],
    });
    expect(managers).toEqual([
      { managerId: "a", rosterPoints: 15, totalPoints: 30 },
      { managerId: "b", rosterPoints: 9, totalPoints: 18 },
    ]);

    const replaced = scoresReplacingDraftWeek(
      [
        { week_id: "w2", manager_id: "a", roster_points: 4, prediction_points: 1, grand_finale_points: 0, total_points: 5 },
        { week_id: "w3", manager_id: "a", roster_points: 6, prediction_points: 0, grand_finale_points: 0, total_points: 6 },
      ],
      "w3",
      managers
    );
    expect(replaced.find((row) => row.week_id === "w2" && row.manager_id === "a")?.total_points).toBe(5);
    expect(replaced.find((row) => row.week_id === "w3" && row.manager_id === "a")).toMatchObject({
      roster_points: 15,
      prediction_points: 0,
      total_points: 30,
    });
    expect(replaced.filter((row) => row.week_id === "w3" && row.manager_id === "a")).toHaveLength(1);
  });

  it("pays nothing before the anchor week and does not wipe a live week", () => {
    expect(
      draftWeekManagerScores({
        weekNumber: 1,
        anchorWeek: 2,
        judgesScoreMultiplier: 1,
        judgesCategoryWeight: 1,
        rosterSlots: [{ managerId: "a", coupleId: "c1" }],
        danceScores: [{ coupleId: "c1", totalScore: 30 }],
      })
    ).toEqual([]);
    const stored = [
      { week_id: "w3", manager_id: "a", roster_points: 6, prediction_points: 0, grand_finale_points: 0, total_points: 6 },
    ];
    expect(scoresReplacingDraftWeek(stored, "w3", [])).toBe(stored);
  });
});

describe("replaceWeekDanceScores", () => {
  it("uses the draft dances for that week", () => {
    const weeks = replaceWeekDanceScores(
      [
        { weekNumber: 2, danceScores: [{ coupleId: "c1", totalScore: 10 }] },
        { weekNumber: 3, danceScores: [{ coupleId: "c1", totalScore: 8 }] },
      ],
      { weekNumber: 3, danceScores: [{ coupleId: "c1", totalScore: 27 }, { coupleId: "c2", totalScore: 24 }] }
    );
    expect(weeks[0].danceScores).toEqual([{ coupleId: "c1", totalScore: 10 }]);
    expect(weeks[1].danceScores).toEqual([
      { coupleId: "c1", totalScore: 27 },
      { coupleId: "c2", totalScore: 24 },
    ]);
  });
});

describe("locked strip copy", () => {
  it("uses the locked label and info sheet", () => {
    expect(DRAFT_SCORES_STRIP_LABEL).toBe("Draft scores · Site Admin to verify");
    expect(DRAFT_SCORES_SHEET).toEqual({
      title: "Draft scores",
      body: "Site Admin has drafted tonight's scores before official publish. Standings may update from these drafts and can change when scores are verified and published.",
      primary: "Got it",
    });
  });
});
