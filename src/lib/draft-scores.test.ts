import { describe, expect, it } from "vitest";
import {
  DRAFT_SCORES_SHEET,
  DRAFT_SCORES_STRIP_LABEL,
  draftReleaseLabel,
  draftScoresVisible,
  draftManagerScoresForNight,
  draftWeekManagerScores,
  excludeReleasedCoupleRows,
  findDraftRelease,
  homeStripChoice,
  postingWeekNumber,
  replaceWeekDanceScores,
  scoresReplacingDraftWeek,
} from "./draft-scores";
import { nightScaledScoresByCouple } from "./scoring";

const weeks = new Map([
  ["w2", 2],
  ["w3", 3],
]);

describe("findDraftRelease", () => {
  it("picks the earliest unpublished night with at least one released couple", () => {
    const release = findDraftRelease(
      [
        { id: "e3", week_id: "w3", results_published_at: null },
        { id: "e2", week_id: "w2", results_published_at: null },
        { id: "e2b", week_id: "w2", results_published_at: null },
        { id: "published", week_id: "w2", results_published_at: "t" },
        { id: "unreleased", week_id: "w3", results_published_at: null },
      ],
      weeks,
      new Map([
        ["e3", ["c9"]],
        ["e2", ["c1", "c2"]],
        ["e2b", ["c3"]],
        ["published", ["c4"]],
      ])
    );
    expect(release).toEqual({
      weekId: "w2",
      weekNumber: 2,
      episodeIds: ["e2", "e2b"],
      releasedCoupleIdsByEpisode: { e2: ["c1", "c2"], e2b: ["c3"] },
    });
  });

  it("only counts an episode with at least one released couple -- partial release within a night is fine", () => {
    const release = findDraftRelease(
      [{ id: "e2", week_id: "w2", results_published_at: null }],
      weeks,
      new Map([["e2", ["c1"]]])
    );
    expect(release?.releasedCoupleIdsByEpisode).toEqual({ e2: ["c1"] });
  });

  it("ignores a night that is not a competition week", () => {
    expect(
      findDraftRelease([{ id: "ex", week_id: null, results_published_at: null }], weeks, new Map([["ex", ["c1"]]]))
    ).toBeNull();
  });

  it("ignores an episode with no released couples yet", () => {
    expect(
      findDraftRelease([{ id: "e2", week_id: "w2", results_published_at: null }], weeks, new Map())
    ).toBeNull();
  });
});

describe("excludeReleasedCoupleRows", () => {
  it("excludes only the released (episode, couple) pairs, leaving other couples' rows in the same episode untouched", () => {
    const rows = [
      { episode_id: "e1", couple_id: "c1", note: "live-revealed" },
      { episode_id: "e1", couple_id: "c2", note: "not released" },
      { episode_id: "e2", couple_id: "c1", note: "different episode, same couple id" },
    ];
    expect(excludeReleasedCoupleRows(rows, { e1: ["c1"] })).toEqual([
      { episode_id: "e1", couple_id: "c2", note: "not released" },
      { episode_id: "e2", couple_id: "c1", note: "different episode, same couple id" },
    ]);
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
        { episodeId: "ep1", coupleId: "c1", totalScore: 20, scaledScore: 20, maxScore: null },
        { episodeId: "ep1", coupleId: "c1", totalScore: 10, scaledScore: 10, maxScore: null },
        { episodeId: "ep1", coupleId: "c2", totalScore: 18, scaledScore: 18, maxScore: null },
      ],
    });
    // c1's two dances share one night: (20 + 10) / 60 × 30 = 15 judges points,
    // × 0.5. Previously 30 × 0.5 (double pay).
    expect(managers).toEqual([
      { managerId: "a", rosterPoints: 7.5, totalPoints: 15 },
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
      roster_points: 7.5,
      prediction_points: 0,
      total_points: 15,
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
        danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 30, scaledScore: 30, maxScore: null }],
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
        { weekNumber: 2, danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 10, scaledScore: 10, maxScore: null }] },
        { weekNumber: 3, danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 8, scaledScore: 8, maxScore: null }] },
      ],
      { weekNumber: 3, danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 27, scaledScore: 27, maxScore: null }, { episodeId: "ep1", coupleId: "c2", totalScore: 24, scaledScore: 24, maxScore: null }] }
    );
    expect(weeks[0].danceScores).toEqual([{ episodeId: "ep1", coupleId: "c1", totalScore: 10, scaledScore: 10, maxScore: null }]);
    expect(weeks[1].danceScores).toEqual([
      { episodeId: "ep1", coupleId: "c1", totalScore: 27, scaledScore: 27, maxScore: null },
      { episodeId: "ep1", coupleId: "c2", totalScore: 24, scaledScore: 24, maxScore: null },
    ]);
  });

  it("merges live and released-draft rows by night and couple, never by couple alone", () => {
    const live = (episodeId: string, coupleId: string, score: number) => ({ episodeId, coupleId, totalScore: score, scaledScore: score, maxScore: null });
    const weeks = replaceWeekDanceScores(
      [
        {
          weekNumber: 3,
          danceScores: [
            // c1 was live-revealed on night A (two dances) and has a released
            // draft for night B of the same week; c2 is live on night B.
            { episodeId: "nightA", coupleId: "c1", totalScore: 28, scaledScore: 21, maxScore: null },
            { episodeId: "nightA", coupleId: "c1", totalScore: 36, scaledScore: 27, maxScore: null },
            live("nightB", "c1", 20),
            live("nightB", "c2", 22),
          ],
        },
      ],
      { weekNumber: 3, danceScores: [live("nightB", "c1", 29)] }
    );
    expect(weeks[0].danceScores).toEqual([
      { episodeId: "nightA", coupleId: "c1", totalScore: 28, scaledScore: 21, maxScore: null },
      { episodeId: "nightA", coupleId: "c1", totalScore: 36, scaledScore: 27, maxScore: null },
      live("nightB", "c2", 22),
      live("nightB", "c1", 29),
    ]);
    // Night A still pays once on 64/80 → 24; night B pays the draft's 29.
    expect(nightScaledScoresByCouple(weeks[0].danceScores).get("c1")).toBe(24 + 29);
  });

  it("merges rather than replaces -- a couple not in the draft (e.g. independently live-revealed) keeps its existing entry", () => {
    const weeks = replaceWeekDanceScores(
      [{ weekNumber: 3, danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 8, scaledScore: 8, maxScore: null }, { episodeId: "ep1", coupleId: "c2", totalScore: 22, scaledScore: 22, maxScore: null }] }],
      { weekNumber: 3, danceScores: [{ episodeId: "ep1", coupleId: "c1", totalScore: 27, scaledScore: 27, maxScore: null }] }
    );
    expect(weeks[0].danceScores).toEqual([
      { episodeId: "ep1", coupleId: "c2", totalScore: 22, scaledScore: 22, maxScore: null },
      { episodeId: "ep1", coupleId: "c1", totalScore: 27, scaledScore: 27, maxScore: null },
    ]);
  });
});

describe("locked strip copy", () => {
  it("uses the locked label and info sheet", () => {
    expect(DRAFT_SCORES_STRIP_LABEL).toBe("Draft scores · Unverified");
    expect(DRAFT_SCORES_SHEET).toEqual({
      title: "Draft scores",
      body: "Tonight's scores are drafted before official publish. Standings may update from these drafts and can change when scores are verified and published.",
      primary: "Got it",
    });
  });
});

describe("draftReleaseLabel", () => {
  const couple = (id: string, celebrity: string, pro: string, status = "active", eliminationWeek: number | null = null) => ({
    id,
    celebrity_name: celebrity,
    pro_name: pro,
    status,
    elimination_week: eliminationWeek,
  });
  const seasonCouples = [
    couple("c1", "Ciara Miller", "Brandon Armstrong"),
    couple("c2", "Jordan Chiles", "Ezra Sosa"),
    couple("c3", "Andy Richter", "Emma Slater", "eliminated", 2),
    couple("c4", "Robert Irwin", "Witney Carson", "eliminated", 3),
  ];

  it("names the latest couple by first names and counts released over couples dancing that week", () => {
    // c3 went out before week 3; c4 went out in week 3 itself, so still danced.
    expect(
      draftReleaseLabel({ latestCoupleId: "c1", releasedCoupleIds: ["c2", "c1", "c1"], weekNumber: 3, seasonCouples })
    ).toBe("Ciara & Brandon · 2/3");
  });

  it("adds a last initial when two first names clash", () => {
    const clash = [...seasonCouples, couple("c5", "Ciara Wilson", "Val Chmerkovskiy")];
    expect(draftReleaseLabel({ latestCoupleId: "c1", releasedCoupleIds: ["c1"], weekNumber: 1, seasonCouples: clash })).toBe(
      "Ciara M. & Brandon · 1/5"
    );
  });
});

describe("draftManagerScoresForNight", () => {
  const settings = { judges_score_multiplier: 1, judges_score_category_weight: 1, judges_score_starts_week: 1 };
  const night = { weekNumber: 4, dances: [{ episodeId: "ep1", coupleId: "c1", total: 30, scaled: 22.5 }] };

  it("pays the manager who held the couple that week, on the scaled score", () => {
    const slots = [
      { manager_id: "a", couple_id: "c1", start_week: 1, end_week: 3 },
      { manager_id: "b", couple_id: "c1", start_week: 4, end_week: null },
      { manager_id: "c", couple_id: null, start_week: 1, end_week: null },
    ];
    expect(draftManagerScoresForNight(settings, slots, night)).toEqual([
      { managerId: "b", rosterPoints: 22.5, totalPoints: 22.5 },
    ]);
  });

  it("pays nothing before the anchor week", () => {
    const slots = [{ manager_id: "a", couple_id: "c1", start_week: 1, end_week: null }];
    expect(
      draftManagerScoresForNight({ ...settings, judges_score_starts_week: 5 }, slots, night)
    ).toEqual([]);
  });
});
