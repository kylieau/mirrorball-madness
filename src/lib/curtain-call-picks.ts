import type { PodiumPick } from "./scoring";

export type CurtainCallPick = {
  elim1: string | null;
  elim2: string | null;
  // The Finale week only, where the podium replaces the elimination pick.
  podium: PodiumPick;
  topScorer: string | null;
};

export const CURTAIN_CALL_PICK_COLUMNS =
  "predicted_eliminated_couple_id, predicted_eliminated_couple_id_2, predicted_winner_couple_id, predicted_runner_up_couple_id, predicted_third_place_couple_id, predicted_top_scorer_couple_id";

export type CurtainCallPickRow = {
  predicted_eliminated_couple_id: string | null;
  predicted_eliminated_couple_id_2: string | null;
  predicted_winner_couple_id: string | null;
  predicted_runner_up_couple_id: string | null;
  predicted_third_place_couple_id: string | null;
  predicted_top_scorer_couple_id: string | null;
};

export function curtainCallPickFromRow(row: CurtainCallPickRow | null | undefined): CurtainCallPick {
  return {
    elim1: row?.predicted_eliminated_couple_id ?? null,
    elim2: row?.predicted_eliminated_couple_id_2 ?? null,
    podium: [
      row?.predicted_winner_couple_id ?? null,
      row?.predicted_runner_up_couple_id ?? null,
      row?.predicted_third_place_couple_id ?? null,
    ],
    topScorer: row?.predicted_top_scorer_couple_id ?? null,
  };
}

// Clearing picks saves a row with every pick null instead of deleting it, so
// "has a row" is not the same as "has made picks".
export function curtainCallPickMade(pick: CurtainCallPick): boolean {
  return !!pick.elim1 || !!pick.podium[0] || !!pick.topScorer;
}

export function hasCurtainCallPicks(row: CurtainCallPickRow | null | undefined): boolean {
  return curtainCallPickMade(curtainCallPickFromRow(row));
}
