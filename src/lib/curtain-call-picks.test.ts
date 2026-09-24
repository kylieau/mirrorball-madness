import { describe, expect, it } from "vitest";
import { hasCurtainCallPicks } from "./curtain-call-picks";

describe("hasCurtainCallPicks", () => {
  it("is false with no row or a row cleared to all nulls", () => {
    expect(hasCurtainCallPicks(null)).toBe(false);
    expect(hasCurtainCallPicks({ predicted_eliminated_couple_id: null, predicted_top_scorer_couple_id: null })).toBe(false);
  });

  it("is true when either pick is set", () => {
    expect(hasCurtainCallPicks({ predicted_eliminated_couple_id: "a", predicted_top_scorer_couple_id: null })).toBe(true);
    expect(hasCurtainCallPicks({ predicted_eliminated_couple_id: null, predicted_top_scorer_couple_id: "b" })).toBe(true);
  });
});
