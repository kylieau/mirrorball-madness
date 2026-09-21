import { bandPayoutFraction, type GrandFinaleMethod, type TierPayStyle } from "./scoring";

export type { GrandFinaleMethod, TierPayStyle };

// Points-per-correct is solved per method (and per band pay style) so every
// option hands Grand Finale the same standings-deciding spread — see
// scripts/monte-carlo-calibration/. Distance credit reaches 0 at exactly
// 4 spots off (200 / 50). Re-run the script and re-paste on a re-fit.
export const GRAND_FINALE_DEFAULT_METHOD: GrandFinaleMethod = "distance_based";
export const GRAND_FINALE_DEFAULT_TIER_PAY_STYLE: TierPayStyle = "equal";
export const GRAND_FINALE_DEFAULT_DISTANCE_PENALTY = 50;
export const GRAND_FINALE_DEFAULT_TIER_SIZE = 3;

export function defaultPointsPerCorrect(method: GrandFinaleMethod, tierPayStyle: TierPayStyle): number {
  switch (method) {
    case "exact_position":
      return 257;
    case "distance_based":
      return 200;
    case "band_tier":
      return tierPayStyle === "graded" ? 252 : 162;
  }
}

export type DistanceCreditRow = { off: number; points: number };

export function distanceCreditTable(pointsPerCorrect: number, penalty: number): DistanceCreditRow[] {
  const rows: DistanceCreditRow[] = [];
  for (let off = 0; off <= 12; off++) {
    const points = Math.max(0, pointsPerCorrect - off * penalty);
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
      return `Earn ${pointsPerCorrect} pts for each couple you place in exactly the right spot. Nothing for near misses.`;
    case "distance_based": {
      const penalty = distancePenalty ?? 0;
      if (penalty <= 0) {
        return `Earn ${pointsPerCorrect} pts for every couple, however far off you are.`;
      }
      const examples = distanceCreditTable(pointsPerCorrect, penalty)
        .slice(0, 4)
        .map((r) => `${r.off === 0 ? "exact" : `${r.off} off`} → ${r.points}`)
        .join(", ");
      const zeroAt = Math.ceil(pointsPerCorrect / penalty);
      return `Earn ${pointsPerCorrect} pts for an exact spot, minus ${penalty} for each spot you're off (${examples}), down to 0 at ${zeroAt} off.`;
    }
    case "band_tier": {
      const width = Math.max(1, tierSize ?? 1);
      const bands = describeBands(totalCouples, width, tierPayStyle);
      const preview = bands.map((b) => `${placeRange(b)}${tierPayStyle === "graded" ? ` (${b.fraction * 100}%)` : ""}`).join(", ");
      const pay =
        tierPayStyle === "graded"
          ? `Lower bands pay less: 75%, 50%, then 25% of ${pointsPerCorrect} pts.`
          : `Every band pays the same.`;
      return `The cast is split into bands of ${width} by finishing place: ${preview}. Earn ${pointsPerCorrect} pts for each couple you place in its correct band — order within a band doesn't matter. ${pay} Separate from the 1st–5th placement bonus below.`;
    }
  }
}
