import { describe, expect, it } from "vitest";
import { releaseEffectiveWeek, removalNote } from "./remove-manager";

const now = new Date("2026-11-13T00:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

describe("releaseEffectiveWeek", () => {
  it("is the first week whose first night hasn't aired", () => {
    expect(
      releaseEffectiveWeek(
        [
          { weekNumber: 9, airsAt: [at(-2)] },
          { weekNumber: 10, airsAt: [at(4), at(5)] },
          { weekNumber: 11, airsAt: [at(11)] },
        ],
        now
      )
    ).toBe(10);
  });

  it("counts a two-night week as aired once its first night has", () => {
    expect(releaseEffectiveWeek([{ weekNumber: 10, airsAt: [at(-1), at(1)] }, { weekNumber: 11, airsAt: [at(6)] }], now)).toBe(11);
  });

  it("treats a week as still to come only when every night has no air time, as SQL's min() does", () => {
    expect(releaseEffectiveWeek([{ weekNumber: 9, airsAt: [at(-2)] }, { weekNumber: 10, airsAt: [null] }], now)).toBe(10);
    expect(releaseEffectiveWeek([{ weekNumber: 9, airsAt: [at(-2), null] }, { weekNumber: 10, airsAt: [at(3)] }], now)).toBe(10);
  });

  it("is the week after the last one once every first night has aired, and ignores weeks with no episode", () => {
    expect(releaseEffectiveWeek([{ weekNumber: 11, airsAt: [at(-8)] }, { weekNumber: 12, airsAt: [at(-1), at(1)] }, { weekNumber: 13, airsAt: [] }], now)).toBe(13);
    expect(releaseEffectiveWeek([], now)).toBe(1);
  });
});

describe("removalNote", () => {
  it("says where the couples go and what stays", () => {
    expect(removalNote("Kim's", "them", { effectiveWeek: 10, recastOn: true })).toBe(
      "Kim's couples go to the waiver wire from Week 10. Points through the week before stay in the standings history. Open waiver claims and trade offers are cancelled. This can't be undone, and the invite code won't let them back in."
    );
    expect(removalNote("Your", "you", { effectiveWeek: 10, recastOn: false })).toMatch(/^Your couples become undrafted from Week 10; turn on Recast.*let you back in\.$/);
  });

  it("keeps the old line before the draft", () => {
    expect(removalNote("Kim's", "them", null)).toBe("They'll lose access to this league.");
    expect(removalNote("Your", "you", null)).toBe("You'll lose access to this league.");
  });
});
