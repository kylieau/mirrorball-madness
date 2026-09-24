// Clearing picks saves a row with every pick null instead of deleting it, so
// "has a row" is not the same as "has made picks".
export function hasCurtainCallPicks(
  row: {
    predicted_eliminated_couple_id: string | null;
    predicted_top_scorer_couple_id: string | null;
  } | null
): boolean {
  return !!row && (!!row.predicted_eliminated_couple_id || !!row.predicted_top_scorer_couple_id);
}
