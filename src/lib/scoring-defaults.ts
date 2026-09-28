// Strong-play ceiling defaults. One weight-1 share is 100 season points
// (TARGET_SHARE 1000 × POINT_SCALE 0.1). Regenerated from
// src/lib/strong-play-ceilings.ts — schema.sql and
// supabase/apply-strong-play-ceilings.sql must carry the same numbers.
// Tests lock the copies together.

export const SURVIVAL_POINTS_DEFAULT = 1.56;
export const ELIMINATION_PREDICTION_POINTS_DEFAULT = 10.35;
export const TOP_SCORER_PREDICTION_POINTS_DEFAULT = 6.9;
export const FIRST_PLACE_POINTS_DEFAULT = 26.09;
export const SECOND_PLACE_POINTS_DEFAULT = 13.04;
export const THIRD_PLACE_POINTS_DEFAULT = 6.96;
export const FOURTH_PLACE_POINTS_DEFAULT = 3.48;
export const FIFTH_PLACE_POINTS_DEFAULT = 1.74;

export const GRAND_FINALE_EXACT_POINTS_PER_CORRECT = 8.33;
export const GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT = 8.33;
export const GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT = 8.33;
export const GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT = 13.33;
export const GRAND_FINALE_DISTANCE_PENALTY_DEFAULT = 2.08;

// Roster size → judges_score_multiplier. The reference roster (3) is the
// column default; start_draft overwrites from dance_card_calibration.
export const JUDGES_SCORE_MULTIPLIER_DEFAULT = 0.1421;

export const DANCE_CARD_CALIBRATION: { rosterSize: number; multiplier: number }[] = [
  { rosterSize: 1, multiplier: 0.5735 },
  { rosterSize: 2, multiplier: 0.2449 },
  { rosterSize: 3, multiplier: 0.1421 },
  { rosterSize: 4, multiplier: 0.0859 },
  { rosterSize: 5, multiplier: 0.0293 },
  { rosterSize: 6, multiplier: 0.0274 },
];
