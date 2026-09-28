// Prints the strong-play ceiling defaults pasted into schema.sql.
// The solve itself lives in src/lib/strong-play-ceilings.ts so tests can
// import it. Node 22 strips the types; no extra toolchain.
//
//   node --experimental-strip-types scripts/monte-carlo-calibration/run.mjs

import {
  curtainCallCeiling,
  danceCardCeiling,
  grandFinaleCeiling,
  solveStrongPlayCeilings,
} from "../../src/lib/strong-play-ceilings.ts";

const solved = solveStrongPlayCeilings();

console.log(`One full share (weight 1): ${solved.ceiling.toFixed(2)} season points\n`);
console.log("--- Global defaults ---");
console.log(`survival_points: ${solved.survivalPoints.toFixed(2)}`);
console.log(`elimination_prediction_points: ${solved.eliminationPoints.toFixed(2)}`);
console.log(`top_scorer_prediction_points: ${solved.topScorerPoints.toFixed(2)}`);
console.log(
  `first_place_points .. fifth_place_points: ${solved.placementPoints.map((v) => v.toFixed(2)).join(", ")}`
);
console.log(`bonus_picks_points_per_correct (exact / distance / equal band): ${solved.pointsPerCorrect.exact_position.toFixed(2)}`);
console.log(
  `bonus_picks_distance_penalty (0 at 4 off): ${solved.distancePenalty.toFixed(2)}`
);
console.log(`bonus_picks_points_per_correct (graded band): ${solved.pointsPerCorrect.band_tier_graded.toFixed(2)}`);

console.log("\n--- dance_card_calibration ---");
for (const row of solved.multipliers) {
  console.log(
    `roster_size ${row.rosterSize}: ${row.multiplier.toFixed(4)}  (ceiling ${danceCardCeiling(solved, row.rosterSize).toFixed(2)}, survival ${(row.structure.survivalFraction * 100).toFixed(0)}%)`
  );
}

console.log("\n--- Ceilings after rounding ---");
console.log(`Curtain Call perfect picks: ${curtainCallCeiling(solved).toFixed(2)}`);
console.log(`Grand Finale exact/distance/equal: ${grandFinaleCeiling(solved, "exact_position").toFixed(2)}`);
console.log(`Grand Finale graded: ${grandFinaleCeiling(solved, "band_tier_graded").toFixed(2)}`);

console.log("\n--- SQL ---\n");
console.log(
  `insert into public.dance_card_calibration (roster_size, judges_score_multiplier_default) values\n` +
    solved.multipliers.map((row) => `  (${row.rosterSize}, ${row.multiplier.toFixed(4)})`).join(",\n") +
    ";"
);
