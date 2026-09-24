// Fantasy points are shown to exactly two decimals everywhere, and the same
// two-decimal rounding is applied when they're computed so stored and
// displayed values agree. Raw judge scores (a 9 out of 10) are not fantasy
// points and stay plain integers.

export function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatPoints(n: number): string {
  const rounded = roundPoints(n);
  // `+ 0` turns -0 into 0 so a tiny negative never renders as "-0.00".
  return (rounded + 0).toFixed(2);
}

export function formatSignedPoints(n: number): string {
  return `${roundPoints(n) >= 0 ? "+" : ""}${formatPoints(n)}`;
}
