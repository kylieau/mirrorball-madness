import { formatPoints, roundPoints } from "./format-points";
import {
  GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT,
  GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT,
  GRAND_FINALE_DISTANCE_PENALTY_DEFAULT,
  GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT,
  GRAND_FINALE_EXACT_POINTS_PER_CORRECT,
} from "./scoring-defaults";
import { bandPayoutFraction, type GrandFinaleMethod, type TierPayStyle } from "./scoring";

export type { GrandFinaleMethod, TierPayStyle };

// Points-per-correct is solved per method so a perfect bracket hits the same
// strong-play ceiling under every option (src/lib/strong-play-ceilings.ts).
// Exact, distance, and equal bands share one base: a perfect pick pays full
// credit either way. Graded bands pay a fraction on lower bands, so their
// base is higher. Distance credit reaches 0 at 4 spots off. There is no
// Grand Finale 3/5 cap — weight 1 is a full share, same as the other modules.
export const GRAND_FINALE_DEFAULT_METHOD: GrandFinaleMethod = "distance_based";
export const GRAND_FINALE_DEFAULT_TIER_PAY_STYLE: TierPayStyle = "equal";
export const GRAND_FINALE_DEFAULT_DISTANCE_PENALTY = GRAND_FINALE_DISTANCE_PENALTY_DEFAULT;
export const GRAND_FINALE_DEFAULT_TIER_SIZE = 3;

export function defaultPointsPerCorrect(method: GrandFinaleMethod, tierPayStyle: TierPayStyle): number {
  switch (method) {
    case "exact_position":
      return GRAND_FINALE_EXACT_POINTS_PER_CORRECT;
    case "distance_based":
      return GRAND_FINALE_DISTANCE_POINTS_PER_CORRECT;
    case "band_tier":
      return tierPayStyle === "graded"
        ? GRAND_FINALE_BAND_GRADED_POINTS_PER_CORRECT
        : GRAND_FINALE_BAND_EQUAL_POINTS_PER_CORRECT;
  }
}

export type DistanceCreditRow = { off: number; points: number };

export function distanceCreditTable(pointsPerCorrect: number, penalty: number): DistanceCreditRow[] {
  const rows: DistanceCreditRow[] = [];
  for (let off = 0; off <= 12; off++) {
    const points = roundPoints(Math.max(0, pointsPerCorrect - off * penalty));
    rows.push({ off, points });
    if (points === 0 || penalty <= 0) break;
  }
  return rows;
}

export type BandRow = { fromPlace: number; toPlace: number; fraction: number };

// Places are finishing places (1 = winner), which is how commissioners and
// managers talk about it, not the internal position where N = winner.
export function describeBands(totalCouples: number, tierSize: number, payStyle: TierPayStyle): BandRow[] {
  const width = Math.max(1, tierSize);
  const rows: BandRow[] = [];
  for (let band = 0; band * width < totalCouples; band++) {
    rows.push({
      fromPlace: band * width + 1,
      toPlace: Math.min((band + 1) * width, totalCouples),
      fraction: bandPayoutFraction(band, payStyle),
    });
  }
  return rows;
}

function placeRange(row: BandRow): string {
  return row.fromPlace === row.toPlace ? `${row.fromPlace}` : `${row.fromPlace}–${row.toPlace}`;
}

export function explainGrandFinaleMethod({
  method,
  pointsPerCorrect,
  distancePenalty,
  tierSize,
  tierPayStyle,
  totalCouples,
}: {
  method: GrandFinaleMethod;
  pointsPerCorrect: number;
  distancePenalty: number | null;
  tierSize: number | null;
  tierPayStyle: TierPayStyle;
  totalCouples: number;
}): string {
  switch (method) {
    case "exact_position":
      return `Earn ${formatPoints(pointsPerCorrect)} pts for each couple you place in exactly the right spot. Nothing for near misses.`;
    case "distance_based": {
      const penalty = distancePenalty ?? 0;
      if (penalty <= 0) {
        return `Earn ${formatPoints(pointsPerCorrect)} pts for every couple, however far off you are.`;
      }
      const examples = distanceCreditTable(pointsPerCorrect, penalty)
        .slice(0, 4)
        .map((r) => `${r.off === 0 ? "exact" : `${r.off} off`} → ${formatPoints(r.points)}`)
        .join(", ");
      const zeroAt = Math.ceil(pointsPerCorrect / penalty);
      return `Earn ${formatPoints(pointsPerCorrect)} pts for an exact spot, minus ${formatPoints(penalty)} for each spot you're off (${examples}), down to ${formatPoints(0)} at ${zeroAt} off.`;
    }
    case "band_tier": {
      const width = Math.max(1, tierSize ?? 1);
      const bands = describeBands(totalCouples, width, tierPayStyle);
      const preview = bands.map((b) => `${placeRange(b)}${tierPayStyle === "graded" ? ` (${b.fraction * 100}%)` : ""}`).join(", ");
      const pay =
        tierPayStyle === "graded"
          ? `Lower bands pay less: 75%, 50%, then 25% of ${formatPoints(pointsPerCorrect)} pts.`
          : `Every band pays the same.`;
      return `The cast is split into bands of ${width} by finishing place: ${preview}. Earn ${formatPoints(pointsPerCorrect)} pts for each couple you place in its correct band — order within a band doesn't matter. ${pay}`;
    }
  }
}
