import { describe, expect, it } from "vitest";
import {
  airsAtForWeek,
  explainGrandFinaleDeadline,
  explainSeasonClock,
  formatLockWithEpisode,
  previewLockWeek,
  shouldShowAnchorSyncControl,
} from "./season-clock";

const episodes = [
  { week_number: 1, airs_at: "2026-09-15T00:00:00Z" },
  { week_number: 2, airs_at: "2026-09-22T00:00:00Z" },
  { week_number: 3, airs_at: "2026-09-29T00:00:00Z" },
];

describe("previewLockWeek", () => {
  it("stays on the anchor when Dance Card is off, even if the RPC rolled forward", () => {
    expect(
      previewLockWeek({
        anchorWeek: 1,
        effectiveHardDeadlineWeek: 3,
        danceCardEnabled: false,
        draftStatus: "not_started",
      })
    ).toBe(1);
  });

  it("stays on the anchor once the draft is completed", () => {
    expect(
      previewLockWeek({
        anchorWeek: 1,
        effectiveHardDeadlineWeek: 1,
        danceCardEnabled: true,
        draftStatus: "completed",
      })
    ).toBe(1);
  });

  it("uses the auto-advanced week while a Dance Card draft is still open", () => {
    expect(
      previewLockWeek({
        anchorWeek: 1,
        effectiveHardDeadlineWeek: 3,
        danceCardEnabled: true,
        draftStatus: "not_started",
      })
    ).toBe(3);
    expect(
      previewLockWeek({
        anchorWeek: 1,
        effectiveHardDeadlineWeek: 3,
        danceCardEnabled: true,
        draftStatus: "in_progress",
      })
    ).toBe(3);
  });

  it("lets a later anchor win over the auto-advanced floor", () => {
    expect(
      previewLockWeek({
        anchorWeek: 5,
        effectiveHardDeadlineWeek: 3,
        danceCardEnabled: true,
        draftStatus: "in_progress",
      })
    ).toBe(5);
  });
});

describe("airsAtForWeek", () => {
  it("returns that episode's airs_at, not a neighbor's", () => {
    expect(airsAtForWeek(episodes, 1)).toBe("2026-09-15T00:00:00Z");
    expect(airsAtForWeek(episodes, 3)).toBe("2026-09-29T00:00:00Z");
    expect(airsAtForWeek(episodes, 4)).toBeNull();
  });
});

describe("formatLockWithEpisode", () => {
  it("ties the lock datetime to the week label", () => {
    expect(formatLockWithEpisode(3, 35, "9/29/2026, 8 PM EDT", true)).toBe(
      "Week 3 · 9/29/2026, 8 PM EDT"
    );
  });

  it("says when that week has no scheduled episode yet", () => {
    expect(formatLockWithEpisode(1, 35, "", false)).toBe("Week 1 (not yet scheduled)");
  });

  it("shows just the label while the local datetime is still hydrating", () => {
    expect(formatLockWithEpisode(1, 35, "", true)).toBe("Week 1");
  });
});

describe("explainSeasonClock", () => {
  it("calls out an auto-advanced lock instead of implying the anchor date", () => {
    expect(
      explainSeasonClock({
        anchorWeek: 1,
        lockWeek: 3,
        seasonNumber: 35,
        danceCardEnabled: true,
        draftStatus: "not_started",
      })
    ).toContain("moved from Week 1 to Week 3");
  });

  it("does not mention draft auto-advance when Dance Card is off", () => {
    const copy = explainSeasonClock({
      anchorWeek: 1,
      lockWeek: 1,
      seasonNumber: 35,
      danceCardEnabled: false,
      draftStatus: "not_started",
    });
    expect(copy).toBe("Grand Finale locks the moment Week 1 airs, and your scoring settings lock then too.");
    expect(copy).not.toContain("pushes");
  });
});

describe("shouldShowAnchorSyncControl", () => {
  it("is only for a commissioner when the lock has rolled past the anchor", () => {
    expect(shouldShowAnchorSyncControl(true, 1, 3)).toBe(true);
    expect(shouldShowAnchorSyncControl(true, 3, 3)).toBe(false);
    expect(shouldShowAnchorSyncControl(false, 1, 3)).toBe(false);
  });
});

describe("explainGrandFinaleDeadline", () => {
  it("names the lock episode, not the anchor, when they have diverged", () => {
    expect(
      explainGrandFinaleDeadline({
        anchorWeek: 1,
        lockWeek: 3,
        seasonNumber: 35,
      })
    ).toContain("Locks at Week 3");
  });
});
