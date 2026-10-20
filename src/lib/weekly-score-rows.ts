import type { Database } from "./supabase/types";
import {
  computeGrandFinalePoints,
  computeWeeklyScores,
  couplesRemainingAtWeek,
  eliminationPositionRanges,
  finalPlacementFromRange,
  RESOLVING_OUTCOMES,
  type GrandFinaleMethod,
  type Outcome,
  type TierPayStyle,
} from "./scoring";
import { eligibleGrandFinalePredictions, scaleGrandFinaleLateFactors } from "./grand-finale-late";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type WeeklyScoreRow = Pick<
  Row<"weekly_manager_scores">,
  | "league_id"
  | "manager_id"
  | "week_id"
  | "roster_points"
  | "prediction_points"
  | "grand_finale_points"
  | "total_points"
>;
export type WeekScoringData = {
  episodes?: Pick<Row<"episodes">, "id" | "episode_number">[];
  dances: Pick<Row<"dance_scores">, "couple_id" | "total_score" | "scaled_score">[];
  outcomes: Pick<Row<"episode_results">, "episode_id" | "couple_id" | "outcome" | "bonus_points">[];
  couples: Pick<Row<"couples">, "id" | "status" | "elimination_week">[];
  jeopardy: Pick<Row<"episode_in_jeopardy_couples">, "couple_id">[];
  leagues: Pick<Row<"leagues">, "id">[];
  settings: Row<"scoring_settings">[];
  rosters: Pick<
    Row<"roster_slots">,
    "league_id" | "manager_id" | "couple_id" | "start_week" | "end_week"
  >[];
  predictions: Row<"predictions">[];
  lateUnlocks: Row<"grand_finale_late_unlocks">[];
  grandFinalePredictions: Row<"grand_finale_predictions">[];
};

// Publication computes these rows before any live write; the database then
// installs results and all leagues' scores in one transaction.
export function buildWeeklyScoreRows(
  data: WeekScoringData,
  week: { id: string; week_number: number; is_double_elimination_week: boolean },
  thisEpisodeId: string,
  thisEpisodeOutcomeRows: { couple_id: string; outcome: string; bonus_points: number }[],
  { reveal = false }: { reveal?: boolean } = {}
): WeeklyScoreRow[] {
  const allDances = data.dances;
  const allOutcomes = data.outcomes;
  const seasonCouples = data.couples;
  const danceScoreInputs = (allDances ?? []).map((row) => ({
    coupleId: row.couple_id,
    totalScore: Number(row.total_score),
    scaledScore: Number(row.scaled_score),
  }));
  const otherOutcomes = (allOutcomes ?? []).filter((row) => row.episode_id !== thisEpisodeId);
  const orderedOutcomeRows = [
    ...otherOutcomes.map((row) => ({
      episodeId: row.episode_id,
      coupleId: row.couple_id,
      outcome: row.outcome as Outcome,
      bonusPoints: Number(row.bonus_points),
    })),
    ...thisEpisodeOutcomeRows.map((row) => ({
      episodeId: thisEpisodeId,
      coupleId: row.couple_id,
      outcome: row.outcome as Outcome,
      bonusPoints: row.bonus_points,
    })),
  ].sort((a, b) => (data.episodes?.find((episode) => episode.id === a.episodeId)?.episode_number ?? 0) -
    (data.episodes?.find((episode) => episode.id === b.episodeId)?.episode_number ?? 0));
  const rawOutcomeRows = orderedOutcomeRows.map(({ coupleId, outcome, bonusPoints }) => ({ coupleId, outcome, bonusPoints }));

  const newlyResolvedCoupleIds = [...new Set(rawOutcomeRows
    .filter((r) => RESOLVING_OUTCOMES.has(r.outcome as Outcome))
    .map((row) => row.coupleId))];

  // Fetched unconditionally (not just on a resolving week) because
  // couplesRemaining/totalCouples now feed Curtain Call's couples-remaining
  // scaling every week, not just weeks where a couple's fate newly resolved.
  const totalCouples = (seasonCouples ?? []).length;
  const positionRanges = eliminationPositionRanges(seasonCouples ?? []);
  const actualPositionByCouple = new Map(
    [...positionRanges].map(([id, range]) => [id, range.start])
  );

  // finalPlacement: 1 = winner .. 5 = fifth place, reusing the same numeric
  // position Grand Finale's full-order prediction already resolves against
  // — see computeWeeklyScores in src/lib/scoring.ts. No new couples.status
  // value, no new admin UI: 4th/5th place is derived, not entered.
  const finalPlacementByCouple = new Map<string, number>();
  for (const [coupleId, range] of positionRanges) {
    const placement = finalPlacementFromRange(range, totalCouples);
    if (placement <= 5) finalPlacementByCouple.set(coupleId, placement);
  }

  // How many couples were still in the running going into this week, before
  // any of this week's own eliminations — matches what managers saw when
  // they locked their Curtain Call pick. Using "< week.week_number" (not a
  // live couples.status check) makes this correct regardless of whether
  // this call is entering one of several episodes sharing this week, or
  // correcting a week whose couples.status has already been mutated above.
  const couplesRemaining = couplesRemainingAtWeek(
    (seasonCouples ?? []).map((c) => ({ eliminationWeek: c.elimination_week })),
    week.week_number
  );

  // Only the row that settles a couple's fate carries its placement. Every
  // other row of the same couple (a "safe" week) would otherwise re-award the
  // podium bonus when an earlier week is recomputed after the finale.
  const episodeOutcomeInputs = rawOutcomeRows.map((row) => ({
    ...row,
    finalPlacement: RESOLVING_OUTCOMES.has(row.outcome)
      ? finalPlacementByCouple.get(row.coupleId) ?? null
      : null,
  }));

  const inJeopardyCoupleIds = reveal ? [] : [...new Set(data.jeopardy.map((r) => r.couple_id))];
  const rows: WeeklyScoreRow[] = [];
  for (const league of data.leagues) {
    const scoringSettings = data.settings.find((r) => r.league_id === league.id);
    const rosterSlots = data.rosters.filter(
      (r) =>
        r.league_id === league.id &&
        r.start_week <= week.week_number &&
        (r.end_week == null || r.end_week >= week.week_number)
    );
    const predictions = data.predictions.filter(
      (r) => r.league_id === league.id && r.week_id === week.id
    );
    const lateUnlocks = data.lateUnlocks.filter((r) => r.league_id === league.id);
    if (!scoringSettings) continue;

    // The league's Anchor Week is when scoring begins for every module: a
    // week that aired before it pays nothing, even where picks exist for it.
    const scoringStarted = week.week_number >= scoringSettings.judges_score_starts_week;

    let grandFinalePointsByManager: Record<string, number> = {};
    if (scoringStarted && newlyResolvedCoupleIds.length > 0) {
      const grandFinalePredictions = data.grandFinalePredictions.filter(
        (r) => r.league_id === league.id && newlyResolvedCoupleIds.includes(r.couple_id)
      );

      const lateByManager = new Map(
        (lateUnlocks ?? [])
          .filter((row) => row.submitted_at)
          .map((row) => [
            row.manager_id,
            {
              lateFactor: Number(row.late_factor),
              ineligibleCoupleIds: new Set(row.ineligible_couple_ids ?? []),
            },
          ])
      );
      // Couples already resolved when a late bracket was saved never pay,
      // including if this week is republished. The factor scales the raw
      // total; category weight is applied in computeWeeklyScores.
      grandFinalePointsByManager = scaleGrandFinaleLateFactors(
        computeGrandFinalePoints({
          predictions: eligibleGrandFinalePredictions(
            (grandFinalePredictions ?? []).map((p) => ({
              managerId: p.manager_id,
              coupleId: p.couple_id,
              predictedPosition: p.predicted_position,
            })),
            lateByManager
          ),
          resolvedCouples: newlyResolvedCoupleIds
            .filter((id) => actualPositionByCouple.has(id))
            .map((id) => ({
              coupleId: id,
              actualPosition: positionRanges.get(id)!.start,
              actualPositionEnd: positionRanges.get(id)!.end,
            })),
          totalCouples,
          method:
            (scoringSettings.bonus_picks_scoring_method as GrandFinaleMethod) ?? "exact_position",
          distancePenalty: scoringSettings.bonus_picks_distance_penalty,
          tierSize: scoringSettings.bonus_picks_tier_size,
          tierPayStyle: scoringSettings.bonus_picks_tier_pay_style as TierPayStyle,
          pointsPerCorrect: scoringSettings.bonus_picks_points_per_correct,
        }),
        lateByManager
      );
    }

    const scores = computeWeeklyScores({
      scoringSettings: {
        judgesScoreMultiplier: scoringSettings.judges_score_multiplier,
        survivalPoints: scoringSettings.survival_points,
        eliminationPredictionPoints: scoringSettings.elimination_prediction_points,
        topScorerPredictionPoints: scoringSettings.top_scorer_prediction_points,
        firstPlacePoints: scoringSettings.first_place_points,
        secondPlacePoints: scoringSettings.second_place_points,
        thirdPlacePoints: scoringSettings.third_place_points,
        fourthPlacePoints: scoringSettings.fourth_place_points,
        fifthPlacePoints: scoringSettings.fifth_place_points,
        curtainCallNearMissEnabled: scoringSettings.curtain_call_near_miss_enabled !== false,
      },
      rosterSlots: scoringStarted
        ? rosterSlots
            .filter((r): r is typeof r & { couple_id: string } => r.couple_id !== null)
            .map((r) => ({ managerId: r.manager_id, coupleId: r.couple_id }))
        : [],
      danceScores: danceScoreInputs,
      episodeOutcomes: episodeOutcomeInputs,
      predictions:
        scoringStarted && !reveal
          ? (predictions ?? []).map((p) => ({
              managerId: p.manager_id,
              predictedEliminatedCoupleId: p.predicted_eliminated_couple_id,
              predictedEliminatedCoupleId2: p.predicted_eliminated_couple_id_2,
              predictedTopScorerCoupleId: p.predicted_top_scorer_couple_id,
            }))
          : [],
      isDoubleElimination: week.is_double_elimination_week,
      couplesRemaining,
      totalCouples,
      categoryWeights: {
        judges: scoringSettings.judges_score_category_weight,
        eliminations: scoringSettings.eliminations_category_weight,
        bonus: scoringSettings.bonus_picks_category_weight,
      },
      grandFinalePointsByManager,
      inJeopardyCoupleIds,
    });

    rows.push(
      ...scores.map((s) => ({
        league_id: league.id,
        manager_id: s.managerId,
        week_id: week.id,
        roster_points: s.rosterPoints,
        prediction_points: s.predictionPoints,
        grand_finale_points: s.grandFinalePoints,
        total_points: s.totalPoints,
      }))
    );
  }
  return rows;
}
