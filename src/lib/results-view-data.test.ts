import { describe, expect, it } from "vitest";
import { summarizeDrafts, visibleResultsData } from "./results-view-data";
import type { DraftState } from "./results-draft";

describe("viewer result payloads", () => {
  it("retains display metadata without serializing drafted scores, outcomes or songs", () => {
    const draft: DraftState = {
      hasDraft: true, updatedAt: null, guestJudgeName: "Secret guest", judgesSaveAvailable: false,
      dances: [{ id: "dance", coupleId: "couple", danceStyleId: "style", songTitle: "Unreleased song", judgeScores: [{ judgeId: "judge", score: 9 }] }],
      entries: [{ coupleId: "couple", outcome: "eliminated", savedByJudges: false, hadImmunity: false, bonusPoints: 7, bonusNote: "Secret bonus" }],
      customMoments: [{ id: "moment", coupleId: "couple", label: "Secret moment" }], inJeopardyCoupleIds: ["couple"],
    };
    expect(summarizeDrafts({ episode: draft })).toEqual({ episode: { hasDraft: true, entryCount: 1, draftedCoupleIds: ["couple"] } });
    expect(JSON.stringify(summarizeDrafts({ episode: draft }))).not.toMatch(/Secret|eliminated|judgeScores|Unreleased/);
  });

  it("removes hidden outcomes, scores, judge rows and jeopardy while retaining exhibitions", () => {
    const data = {
      episodes: [{ id: "seen", week_id: "w1" }, { id: "hidden", week_id: "w2" }, { id: "exhibition", week_id: null }],
      danceScores: ["seen", "hidden", "exhibition"].map((id) => ({ id, episode_id: id })),
      judgeScores: ["seen", "hidden", "exhibition"].map((id) => ({ dance_score_id: id })),
      episodeResults: ["seen", "hidden"].map((id) => ({ episode_id: id })),
      inJeopardyByEpisode: { seen: ["a"], hidden: ["b"] },
    } as unknown as Parameters<typeof visibleResultsData>[0];
    const result = visibleResultsData(data, new Set(["w1"]));
    expect(result.danceScores.map((row) => row.id)).toEqual(["seen", "exhibition"]);
    expect(result.judgeScores.map((row) => row.dance_score_id)).toEqual(["seen", "exhibition"]);
    expect(result.episodeResults.map((row) => row.episode_id)).toEqual(["seen"]);
    expect(result.inJeopardyByEpisode).toEqual({ seen: ["a"] });
  });
});
