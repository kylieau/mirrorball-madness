import {
  DANCE_CARD_CALIBRATION,
  ELIMINATION_PREDICTION_POINTS_DEFAULT,
  FIFTH_PLACE_POINTS_DEFAULT,
  FIRST_PLACE_POINTS_DEFAULT,
  FOURTH_PLACE_POINTS_DEFAULT,
  GRAND_FINALE_DISTANCE_PENALTY_DEFAULT,
  JUDGES_SCORE_MULTIPLIER_DEFAULT,
  SECOND_PLACE_POINTS_DEFAULT,
  SURVIVAL_POINTS_DEFAULT,
  THIRD_PLACE_POINTS_DEFAULT,
  TOP_SCORER_PREDICTION_POINTS_DEFAULT,
} from "./scoring-defaults";
import {
  defaultPointsPerCorrect,
  GRAND_FINALE_DEFAULT_METHOD,
  GRAND_FINALE_DEFAULT_TIER_PAY_STYLE,
  GRAND_FINALE_DEFAULT_TIER_SIZE,
  type GrandFinaleMethod,
  type TierPayStyle,
} from "./grand-finale-explainer";

// Four decimals is enough that a third reads as the same number on every
// module (0.3333) and still round-trips through JSON as that exact value.
// The remainder (0.0001 across three modules) is left unassigned so one
// module is never a hair heavier than the others.
const WEIGHT_DECIMALS = 4;

export type ModuleEnabled = {
  curtainCall: boolean;
  danceCard: boolean;
  grandFinale: boolean;
};

export type ModuleWeights = {
  curtainCall: number;
  danceCard: number;
  grandFinale: number;
};

export function evenModuleWeight(enabledCount: number): number {
  if (enabledCount <= 0) return 0;
  const factor = 10 ** WEIGHT_DECIMALS;
  return Math.round((1 / enabledCount) * factor) / factor;
}

// Enabled modules share 1 evenly. A module that is off is 0, so the next
// publish does not keep paying it at its old weight — the scoring engine
// applies whatever weight is stored and does not consult the on/off flag.
export function redistributeModuleWeights(enabled: ModuleEnabled): ModuleWeights {
  const enabledCount = [enabled.curtainCall, enabled.danceCard, enabled.grandFinale].filter(Boolean).length;
  const share = evenModuleWeight(enabledCount);
  return {
    curtainCall: enabled.curtainCall ? share : 0,
    danceCard: enabled.danceCard ? share : 0,
    grandFinale: enabled.grandFinale ? share : 0,
  };
}

// Same nearest-roster rule as start_draft: abs distance, then the smaller
// roster size. The reference roster (3) is the column default before a
// draft has fixed leagues.roster_size.
export function calibratedJudgesScoreMultiplier(rosterSize: number): number {
  const best = [...DANCE_CARD_CALIBRATION].sort((a, b) => {
    const dist = Math.abs(a.rosterSize - rosterSize) - Math.abs(b.rosterSize - rosterSize);
    return dist !== 0 ? dist : a.rosterSize - b.rosterSize;
  })[0];
  return best?.multiplier ?? JUDGES_SCORE_MULTIPLIER_DEFAULT;
}

export type NeutralPointDefaults = {
  judgesScoreMultiplier: number;
  survivalPoints: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  thirdPlacePoints: number;
  fourthPlacePoints: number;
  fifthPlacePoints: number;
  eliminationPredictionPoints: number;
  topScorerPredictionPoints: number;
  nearMissEnabled: boolean;
  bonusMethod: GrandFinaleMethod;
  bonusDistancePenalty: number;
  bonusTierSize: number;
  bonusTierPayStyle: TierPayStyle;
  bonusPicksPointsPerCorrect: number;
};

// Point values only. Weights are redistributeModuleWeights for whatever is
// currently on — a reset must not invent a module set. The draft-complete
// multiplier lock is honored here so the form does not send a value
// update_scoring_categories would reject.
export function neutralPointDefaults(input: {
  rosterSize: number;
  multiplierLocked: boolean;
  currentMultiplier: number;
}): NeutralPointDefaults {
  return {
    judgesScoreMultiplier: input.multiplierLocked
      ? input.currentMultiplier
      : calibratedJudgesScoreMultiplier(input.rosterSize),
    survivalPoints: SURVIVAL_POINTS_DEFAULT,
    firstPlacePoints: FIRST_PLACE_POINTS_DEFAULT,
    secondPlacePoints: SECOND_PLACE_POINTS_DEFAULT,
    thirdPlacePoints: THIRD_PLACE_POINTS_DEFAULT,
    fourthPlacePoints: FOURTH_PLACE_POINTS_DEFAULT,
    fifthPlacePoints: FIFTH_PLACE_POINTS_DEFAULT,
    eliminationPredictionPoints: ELIMINATION_PREDICTION_POINTS_DEFAULT,
    topScorerPredictionPoints: TOP_SCORER_PREDICTION_POINTS_DEFAULT,
    nearMissEnabled: true,
    bonusMethod: GRAND_FINALE_DEFAULT_METHOD,
    bonusDistancePenalty: GRAND_FINALE_DISTANCE_PENALTY_DEFAULT,
    bonusTierSize: GRAND_FINALE_DEFAULT_TIER_SIZE,
    bonusTierPayStyle: GRAND_FINALE_DEFAULT_TIER_PAY_STYLE,
    bonusPicksPointsPerCorrect: defaultPointsPerCorrect(
      GRAND_FINALE_DEFAULT_METHOD,
      GRAND_FINALE_DEFAULT_TIER_PAY_STYLE
    ),
  };
}
