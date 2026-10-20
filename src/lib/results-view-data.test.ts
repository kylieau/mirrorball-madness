import { describe, expect, it } from "vitest";
import { summarizeDrafts } from "./results-view-data";
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


});
