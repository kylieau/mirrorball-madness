import { describe, expect, it } from "vitest";
import { isUnscheduledPlaceholderRow, resolveEpisodeCoupleIds } from "./episode-participants";

describe("resolveEpisodeCoupleIds", () => {
  it("returns every active couple when no participants are configured", () => {
    expect(resolveEpisodeCoupleIds(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("filters down to just the configured participants", () => {
    expect(resolveEpisodeCoupleIds(["a", "b", "c"], ["b"])).toEqual(["b"]);
  });

  it("excludes a participant id that's no longer active", () => {
    expect(resolveEpisodeCoupleIds(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });
});

describe("isUnscheduledPlaceholderRow", () => {
  const base = { coupleId: "a", outcome: "safe", hasDances: false, hasNotes: false };

  it("hides a safe row for a couple the split-night schedule left out", () => {
    expect(isUnscheduledPlaceholderRow({ ...base, participantCoupleIds: ["b"] })).toBe(true);
    expect(isUnscheduledPlaceholderRow({ ...base, outcome: "bye", participantCoupleIds: ["b"] })).toBe(true);
  });

  it("keeps everything when the episode is unrestricted", () => {
    expect(isUnscheduledPlaceholderRow({ ...base, participantCoupleIds: [] })).toBe(false);
    expect(isUnscheduledPlaceholderRow({ ...base, participantCoupleIds: undefined })).toBe(false);
  });

  it("keeps a scheduled participant, including a DND", () => {
    expect(isUnscheduledPlaceholderRow({ ...base, outcome: "bye", participantCoupleIds: ["a"] })).toBe(false);
  });

  it("keeps an unscheduled couple's row when something real happened", () => {
    expect(isUnscheduledPlaceholderRow({ ...base, outcome: "withdrawn", participantCoupleIds: ["b"] })).toBe(false);
    expect(isUnscheduledPlaceholderRow({ ...base, outcome: "eliminated", participantCoupleIds: ["b"] })).toBe(false);
    expect(isUnscheduledPlaceholderRow({ ...base, hasNotes: true, participantCoupleIds: ["b"] })).toBe(false);
    expect(isUnscheduledPlaceholderRow({ ...base, hasDances: true, participantCoupleIds: ["b"] })).toBe(false);
  });
});
