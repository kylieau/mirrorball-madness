import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { bandPayoutFraction } from "./scoring";
import {
  DANCE_CARD_CALIBRATION,
  ELIMINATION_PREDICTION_POINTS_DEFAULT,
  FIFTH_PLACE_POINTS_DEFAULT,
  FIRST_PLACE_POINTS_DEFAULT,
  FOURTH_PLACE_POINTS_DEFAULT,
  GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT,
  GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT,
  GRAND_FINALE_DISTANCE_PENALTY_DEFAULT,
  GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT,
  GRAND_FINALE_EXACT_POINTS_PER_CORRECT,
  JUDGES_SCORE_MULTIPLIER_DEFAULT,
  SECOND_PLACE_POINTS_DEFAULT,
  SURVIVAL_POINTS_DEFAULT,
  THIRD_PLACE_POINTS_DEFAULT,
  TOP_SCORER_PREDICTION_POINTS_DEFAULT,
} from "./scoring-defaults";
import { defaultPointsPerCorrect, GRAND_FINALE_DEFAULT_DISTANCE_PENALTY } from "./grand-finale-explainer";
import {
  bandFraction,
  curtainCallCeiling,
  danceCardCeiling,
  danceCardStructure,
  POINT_SCALE,
  REFERENCE_ROSTER_SIZE,
  ROSTER_SIZES,
  solveStrongPlayCeilings,
  TARGET_SHARE,
  grandFinaleCeiling,
} from "./strong-play-ceilings";

const SHARE = TARGET_SHARE * POINT_SCALE;

describe("strong-play ceilings", () => {
  const solved = solveStrongPlayCeilings();

  it("prices one full share at 100 season points", () => {
    expect(SHARE).toBe(100);
    expect(solved.ceiling).toBe(100);
  });

  it("gives every module the same ceiling, including Grand Finale", () => {
    const nearShare = (value: number) => {
      expect(Math.abs(value - SHARE)).toBeLessThan(0.1);
    };
    nearShare(curtainCallCeiling(solved));
    for (const rosterSize of ROSTER_SIZES) nearShare(danceCardCeiling(solved, rosterSize));
    nearShare(grandFinaleCeiling(solved, "exact_position"));
    nearShare(grandFinaleCeiling(solved, "distance_based"));
    nearShare(grandFinaleCeiling(solved, "band_tier_equal"));
    nearShare(grandFinaleCeiling(solved, "band_tier_graded"));
    // The retired variance cap paid Grand Finale 3/5 of a share.
    expect(grandFinaleCeiling(solved, "distance_based")).toBeGreaterThan(SHARE * 0.9);
  });

  it("keeps a strong roster from surviving the whole season", () => {
    for (const rosterSize of ROSTER_SIZES) {
      const structure = danceCardStructure(rosterSize);
      expect(structure.survivalFraction).toBeLessThan(0.8);
      expect(structure.survivalFraction).toBeGreaterThan(0);
    }
    const reference = danceCardStructure(REFERENCE_ROSTER_SIZE);
    const ranks = reference.ranksBySlot.flat();
    expect(ranks).not.toContain(1);
    expect(reference.ranksBySlot).toEqual([
      [2, 7, 10],
      [3, 6, 11],
    ]);
  });

  it("holds the 3:2 Curtain Call ratio and a 4-spot distance zero", () => {
    expect(solved.eliminationPoints / solved.topScorerPoints).toBeCloseTo(1.5, 5);
    expect(solved.distancePenalty * 4).toBeCloseTo(solved.pointsPerCorrect.distance_based, 1);
    expect(solved.pointsPerCorrect.exact_position).toBe(solved.pointsPerCorrect.distance_based);
    expect(solved.pointsPerCorrect.band_tier_graded).toBeGreaterThan(solved.pointsPerCorrect.band_tier_equal);
  });

  it("keeps every roster-size multiplier positive", () => {
    for (const row of solved.multipliers) {
      expect(row.multiplier).toBeGreaterThan(0);
    }
  });

  it("matches the graded-band fraction the scoring engine pays", () => {
    for (let band = 0; band < 6; band++) {
      expect(bandFraction(band)).toBe(bandPayoutFraction(band, "graded"));
    }
  });
});

describe("shipped defaults match the solver", () => {
  const solved = solveStrongPlayCeilings();

  it("locks scoring-defaults.ts to the solve", () => {
    expect(SURVIVAL_POINTS_DEFAULT).toBe(solved.survivalPoints);
    expect(ELIMINATION_PREDICTION_POINTS_DEFAULT).toBe(solved.eliminationPoints);
    expect(TOP_SCORER_PREDICTION_POINTS_DEFAULT).toBe(solved.topScorerPoints);
    expect(FIRST_PLACE_POINTS_DEFAULT).toBe(solved.placementPoints[0]);
    expect(SECOND_PLACE_POINTS_DEFAULT).toBe(solved.placementPoints[1]);
    expect(THIRD_PLACE_POINTS_DEFAULT).toBe(solved.placementPoints[2]);
    expect(FOURTH_PLACE_POINTS_DEFAULT).toBe(solved.placementPoints[3]);
    expect(FIFTH_PLACE_POINTS_DEFAULT).toBe(solved.placementPoints[4]);
    expect(GRAND_FINALE_EXACT_POINTS_PER_CORRECT).toBe(solved.pointsPerCorrect.exact_position);
    expect(GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT).toBe(solved.pointsPerCorrect.distance_based);
    expect(GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT).toBe(solved.pointsPerCorrect.band_tier_equal);
    expect(GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT).toBe(solved.pointsPerCorrect.band_tier_graded);
    expect(GRAND_FINALE_DISTANCE_PENALTY_DEFAULT).toBe(solved.distancePenalty);
    expect(JUDGES_SCORE_MULTIPLIER_DEFAULT).toBe(
      solved.multipliers.find((row) => row.rosterSize === REFERENCE_ROSTER_SIZE)?.multiplier
    );
    expect(DANCE_CARD_CALIBRATION).toEqual(
      solved.multipliers.map((row) => ({ rosterSize: row.rosterSize, multiplier: row.multiplier }))
    );
  });

  it("feeds the Grand Finale method picker", () => {
    expect(defaultPointsPerCorrect("exact_position", "equal")).toBe(GRAND_FINALE_EXACT_POINTS_PER_CORRECT);
    expect(defaultPointsPerCorrect("distance_based", "equal")).toBe(GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT);
    expect(defaultPointsPerCorrect("band_tier", "equal")).toBe(GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT);
    expect(defaultPointsPerCorrect("band_tier", "graded")).toBe(GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT);
    expect(GRAND_FINALE_DEFAULT_DISTANCE_PENALTY).toBe(GRAND_FINALE_DISTANCE_PENALTY_DEFAULT);
  });

  it("pastes the same numbers into schema.sql and the live migration", () => {
    const schema = readFileSync(fileURLToPath(new URL("../../supabase/schema.sql", import.meta.url)), "utf8");
    const migration = readFileSync(
      fileURLToPath(new URL("../../supabase/apply-strong-play-ceilings.sql", import.meta.url)),
      "utf8"
    );
    for (const source of [schema, migration]) {
      expect(source).toContain("default 1.56");
      expect(source).toContain("default 10.35");
      expect(source).toContain("default 6.9,");
      expect(source).toContain("default 26.09");
      expect(source).toContain("default 8.33");
      expect(source).toContain("(1, 0.5735)");
      expect(source).toContain("(3, 0.1421)");
      expect(source).toContain("(6, 0.0274)");
      expect(source).toContain("then 2.08");
      expect(source).toContain("8.33");
    }
    expect(migration).toContain("f38df148-85b2-4f06-89ae-6ef72b8fea2e");
    expect(migration).toContain("3e0e38cd-823a-41af-a411-0ecf1fc88226");
    expect(migration).toContain("8afa3b4f-a4d6-4e2d-902f-19716c41f7c4");
    expect(migration).toContain("d18784af-378c-4d63-8000-d5928265aab1");
    expect(migration).not.toContain("judges_score_category_enabled =");
    expect(migration).not.toContain("judges_score_category_weight =");
    expect(migration).not.toContain("bonus_picks_category_enabled =");
  });
});
