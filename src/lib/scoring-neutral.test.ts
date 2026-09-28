import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GRAND_FINALE_DEFAULT_DISTANCE_PENALTY, defaultPointsPerCorrect } from "./grand-finale-explainer";
import {
  DANCE_CARD_CALIBRATION,
  ELIMINATION_PREDICTION_POINTS_DEFAULT,
  FIFTH_PLACE_POINTS_DEFAULT,
  FIRST_PLACE_POINTS_DEFAULT,
  FOURTH_PLACE_POINTS_DEFAULT,
  SECOND_PLACE_POINTS_DEFAULT,
  SURVIVAL_POINTS_DEFAULT,
  THIRD_PLACE_POINTS_DEFAULT,
  TOP_SCORER_PREDICTION_POINTS_DEFAULT,
} from "./scoring-defaults";
import {
  calibratedJudgesScoreMultiplier,
  evenModuleWeight,
  neutralPointDefaults,
  redistributeModuleWeights,
} from "./scoring-neutral";

const DC_CC = { curtainCall: true, danceCard: true, grandFinale: false };
const ALL = { curtainCall: true, danceCard: true, grandFinale: true };

describe("redistributeModuleWeights", () => {
  it("splits Dance Card and Curtain Call in half when Grand Finale turns off", () => {
    expect(redistributeModuleWeights(DC_CC)).toEqual({
      curtainCall: 0.5,
      danceCard: 0.5,
      grandFinale: 0,
    });
  });

  it("gives each module a third when Grand Finale turns on beside the other two", () => {
    expect(redistributeModuleWeights(ALL)).toEqual({
      curtainCall: 0.3333,
      danceCard: 0.3333,
      grandFinale: 0.3333,
    });
    expect(evenModuleWeight(3)).toBe(0.3333);
  });

  it("gives a single enabled module the whole share", () => {
    expect(redistributeModuleWeights({ curtainCall: false, danceCard: true, grandFinale: false })).toEqual({
      curtainCall: 0,
      danceCard: 1,
      grandFinale: 0,
    });
  });

  it("uses the same share for every module that stays on", () => {
    for (const enabled of [
      DC_CC,
      ALL,
      { curtainCall: true, danceCard: false, grandFinale: true },
      { curtainCall: false, danceCard: true, grandFinale: true },
    ]) {
      const weights = redistributeModuleWeights(enabled);
      const on = [weights.curtainCall, weights.danceCard, weights.grandFinale].filter((weight) => weight > 0);
      expect(new Set(on).size).toBe(1);
    }
  });

  it("returns weights only — point defaults are a separate call", () => {
    const weights = redistributeModuleWeights(ALL);
    expect(Object.keys(weights).sort()).toEqual(["curtainCall", "danceCard", "grandFinale"]);
  });
});

describe("neutralPointDefaults", () => {
  it("restores the strong-play point defaults and the distance-based Grand Finale base", () => {
    const neutral = neutralPointDefaults({
      rosterSize: 3,
      multiplierLocked: false,
      currentMultiplier: 9,
    });
    expect(neutral.survivalPoints).toBe(SURVIVAL_POINTS_DEFAULT);
    expect(neutral.firstPlacePoints).toBe(FIRST_PLACE_POINTS_DEFAULT);
    expect(neutral.secondPlacePoints).toBe(SECOND_PLACE_POINTS_DEFAULT);
    expect(neutral.thirdPlacePoints).toBe(THIRD_PLACE_POINTS_DEFAULT);
    expect(neutral.fourthPlacePoints).toBe(FOURTH_PLACE_POINTS_DEFAULT);
    expect(neutral.fifthPlacePoints).toBe(FIFTH_PLACE_POINTS_DEFAULT);
    expect(neutral.eliminationPredictionPoints).toBe(ELIMINATION_PREDICTION_POINTS_DEFAULT);
    expect(neutral.topScorerPredictionPoints).toBe(TOP_SCORER_PREDICTION_POINTS_DEFAULT);
    expect(neutral.nearMissEnabled).toBe(true);
    expect(neutral.bonusMethod).toBe("distance_based");
    expect(neutral.bonusDistancePenalty).toBe(GRAND_FINALE_DEFAULT_DISTANCE_PENALTY);
    expect(neutral.bonusTierSize).toBe(3);
    expect(neutral.bonusTierPayStyle).toBe("equal");
    expect(neutral.bonusPicksPointsPerCorrect).toBe(defaultPointsPerCorrect("distance_based", "equal"));
    expect(neutral.judgesScoreMultiplier).toBe(0.1421);
  });

  it("uses the roster-size calibration, clamping the way start_draft does", () => {
    expect(calibratedJudgesScoreMultiplier(4)).toBe(0.0859);
    expect(calibratedJudgesScoreMultiplier(1)).toBe(0.5735);
    expect(calibratedJudgesScoreMultiplier(6)).toBe(0.0274);
    expect(calibratedJudgesScoreMultiplier(9)).toBe(
      DANCE_CARD_CALIBRATION.find((row) => row.rosterSize === 6)?.multiplier
    );
    expect(
      neutralPointDefaults({ rosterSize: 2, multiplierLocked: false, currentMultiplier: 1 }).judgesScoreMultiplier
    ).toBe(0.2449);
  });

  it("leaves the judges multiplier alone once the draft is complete", () => {
    const neutral = neutralPointDefaults({
      rosterSize: 4,
      multiplierLocked: true,
      currentMultiplier: 0.2,
    });
    expect(neutral.judgesScoreMultiplier).toBe(0.2);
    expect(neutral.survivalPoints).toBe(SURVIVAL_POINTS_DEFAULT);
  });
});

describe("League Settings wires the split and the reset", () => {
  const form = readFileSync(
    fileURLToPath(new URL("../components/league-modules-form.tsx", import.meta.url)),
    "utf8"
  );

  it("splits weights on toggle, resets to the calibrated defaults, and stops when scoring is locked", () => {
    expect(form).toContain("redistributeModuleWeights");
    expect(form).toContain("neutralPointDefaults");
    expect(form).toContain("Reset to Neutral");
    expect(form).toContain("if (scoringLocked) return;");
    expect(form).toContain("disabled={scoringLocked || submitting}");
    expect(form).toContain("Point values stay as you set them.");
  });
});

describe("update_scoring_categories keeps the draft-complete lock and clears a calibration save", () => {
  const schema = readFileSync(fileURLToPath(new URL("../../supabase/schema.sql", import.meta.url)), "utf8");
  const migration = readFileSync(
    fileURLToPath(new URL("../../supabase/apply-reset-scoring-neutral.sql", import.meta.url)),
    "utf8"
  );

  it("still rejects a different multiplier after the draft is complete", () => {
    for (const source of [schema, migration]) {
      expect(source).toContain("Judges'' Score Multiplier is locked — the draft is complete");
      expect(source).toContain("draft_status = 'completed'");
    }
  });

  it("clears judges_score_multiplier_customized when the saved value is the roster calibration", () => {
    for (const source of [schema, migration]) {
      expect(source).toContain("p_judges_score_multiplier is not distinct from");
      expect(source).toContain("judges_score_multiplier_default");
      expect(source).toContain("then false");
    }
  });

  it("keeps the live function body identical to schema.sql", () => {
    const from = "function public.update_scoring_categories(";
    const schemaFn = schema.slice(schema.indexOf(`create ${from}`));
    const migrationFn = migration.slice(migration.indexOf(`create or replace ${from}`)).replace("create or replace ", "create ");
    const schemaEnd = schemaFn.indexOf("\n$$;") + "\n$$;".length;
    const migrationEnd = migrationFn.indexOf("\n$$;") + "\n$$;".length;
    expect(migrationFn.slice(0, migrationEnd)).toBe(schemaFn.slice(0, schemaEnd));
  });
});
