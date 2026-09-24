import { describe, expect, it } from "vitest";
import { findRevealingWeek, scoredWeekIds } from "./revealing-week";

const ep = (id: string, over: Partial<{ status: string; results_published_at: string | null }> = {}) => ({
  id,
  status: "upcoming",
  results_published_at: null,
  ...over,
});
const week = (id: string, week_number: number, episodes = [ep(`${id}-e`)]) => ({ id, week_number, episodes });

describe("findRevealingWeek", () => {
  it("finds an unpublished episode that already has live scores", () => {
    const weeks = [week("w1", 1, [ep("e1", { status: "completed", results_published_at: "2026-09-16" })]), week("w2", 2)];
    const found = findRevealingWeek(weeks, new Set(["w2-e"]));
    expect(found?.week.id).toBe("w2");
    expect(found?.episodeIds).toEqual(["w2-e"]);
  });

  it("ignores published episodes and weeks with no live scores", () => {
    const weeks = [week("w1", 1, [ep("e1", { status: "completed", results_published_at: "2026-09-16" })]), week("w2", 2)];
    expect(findRevealingWeek(weeks, new Set(["e1"]))).toBeNull();
    expect(findRevealingWeek(weeks, new Set())).toBeNull();
  });
});

describe("scoredWeekIds", () => {
  const revealing = { id: "w3", week_number: 3 };
  const allowed = new Set(["w1", "w2"]);

  it("adds nothing when no week is revealing", () => {
    expect([...scoredWeekIds({ spoilerFreeMode: false, lastWatchedWeek: null, allowedEpisodeIds: allowed }, null)]).toEqual(["w1", "w2"]);
  });

  it("adds the revealing week for Spoiler-Free-off viewers", () => {
    expect(scoredWeekIds({ spoilerFreeMode: false, lastWatchedWeek: null, allowedEpisodeIds: allowed }, revealing).has("w3")).toBe(true);
  });

  it("hides it from Spoiler-Free viewers until they mark that week watched", () => {
    const base = { spoilerFreeMode: true, allowedEpisodeIds: allowed };
    expect(scoredWeekIds({ ...base, lastWatchedWeek: 2 }, revealing).has("w3")).toBe(false);
    expect(scoredWeekIds({ ...base, lastWatchedWeek: 3 }, revealing).has("w3")).toBe(true);
  });
});
