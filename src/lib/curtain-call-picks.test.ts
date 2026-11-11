import { describe, expect, it } from "vitest";
import { curtainCallPickFromRow, hasCurtainCallPicks, type CurtainCallPickRow } from "./curtain-call-picks";

const row = (picks: Partial<CurtainCallPickRow>): CurtainCallPickRow => ({
  predicted_eliminated_couple_id: null,
  predicted_eliminated_couple_id_2: null,
  predicted_winner_couple_id: null,
  predicted_runner_up_couple_id: null,
  predicted_third_place_couple_id: null,
  predicted_top_scorer_couple_id: null,
  ...picks,
});

describe("hasCurtainCallPicks", () => {
  it("is false with no row or a row cleared to all nulls", () => {
    expect(hasCurtainCallPicks(null)).toBe(false);
    expect(hasCurtainCallPicks(row({}))).toBe(false);
  });

  it("is true when an elimination, podium or top scorer pick is set", () => {
    expect(hasCurtainCallPicks(row({ predicted_eliminated_couple_id: "a" }))).toBe(true);
    expect(hasCurtainCallPicks(row({ predicted_top_scorer_couple_id: "b" }))).toBe(true);
    expect(
      hasCurtainCallPicks(
        row({ predicted_winner_couple_id: "a", predicted_runner_up_couple_id: "b", predicted_third_place_couple_id: "c" })
      )
    ).toBe(true);
  });
});

describe("curtainCallPickFromRow", () => {
  it("reads the podium in place order", () => {
    expect(
      curtainCallPickFromRow(
        row({ predicted_winner_couple_id: "w", predicted_runner_up_couple_id: "r", predicted_third_place_couple_id: "t" })
      )
    ).toEqual({ elim1: null, elim2: null, podium: ["w", "r", "t"], topScorer: null });
    expect(curtainCallPickFromRow(null).podium).toEqual([null, null, null]);
  });
});
