-- Point-scale rescale: uniform ÷10 across scoring_settings' calibrated
-- point values and dance_card_calibration.judges_score_multiplier_default.
--
-- Why: the scoring calibration layer's Monte Carlo-derived defaults
-- (2026-09-20) put a single manager's single-week score in the 1000s —
-- unrecognizable against typical fantasy-sports point totals. Every
-- scoring formula in src/lib/scoring.ts is linear (sums and multiplies
-- these constants), so dividing every one of them by the same factor
-- preserves every relative-influence ratio the calibration solved for —
-- this is a unit change, not a recalibration. See
-- scripts/monte-carlo-calibration/run.mjs's POINT_SCALE = 0.1 comment for
-- the generator this was run through.
--
-- Applies to every league's scoring_settings, including already-customized
-- ones (judges_score_multiplier_customized is left alone — this is a
-- blanket unit conversion, not the kind of recalibration that flag exists
-- to guard against), and backfills every already-published
-- weekly_manager_scores row the same way the prior decimal-rounding
-- backfill did: divide+round the raw components, then recompute
-- total_points from that league's own (unaffected) category weights.
--
-- No column added or removed, so no type regeneration needed.
--
-- Run EXACTLY ONCE in the Supabase Dashboard SQL Editor — this script is
-- not idempotent; re-running it divides everything by 10 again.

begin;

-- New-league defaults going forward.
alter table public.scoring_settings
  alter column survival_points set default 1.5,
  alter column elimination_prediction_points set default 17.1,
  alter column top_scorer_prediction_points set default 11.4,
  alter column first_place_points set default 10.6,
  alter column second_place_points set default 5.3,
  alter column third_place_points set default 2.8,
  alter column fourth_place_points set default 1.4,
  alter column fifth_place_points set default 0.7,
  alter column bonus_picks_points_per_correct set default 20.7;

update public.dance_card_calibration set judges_score_multiplier_default = case roster_size
  when 1 then 0.2362
  when 2 then 0.1618
  when 3 then 0.1332
  when 4 then 0.1168
  when 5 then 0.1072
  when 6 then 0.1053
end;

-- Existing leagues: same ÷10 rescale on every row.
update public.scoring_settings set
  judges_score_multiplier = round(judges_score_multiplier / 10, 4),
  survival_points = round(survival_points / 10, 2),
  elimination_prediction_points = round(elimination_prediction_points / 10, 2),
  top_scorer_prediction_points = round(top_scorer_prediction_points / 10, 2),
  first_place_points = round(first_place_points / 10, 2),
  second_place_points = round(second_place_points / 10, 2),
  third_place_points = round(third_place_points / 10, 2),
  fourth_place_points = round(fourth_place_points / 10, 2),
  fifth_place_points = round(fifth_place_points / 10, 2),
  bonus_picks_points_per_correct = round(bonus_picks_points_per_correct / 10, 2),
  bonus_picks_distance_penalty = round(bonus_picks_distance_penalty / 10, 2);

-- Already-published weekly_manager_scores: divide+round the raw components,
-- then recompute total_points from each league's own category weights
-- (weight columns are untouched by this migration).
with rescaled as (
  select
    wms.id,
    round(wms.roster_points / 10) as new_roster_points,
    round(wms.prediction_points / 10) as new_prediction_points,
    round(wms.grand_finale_points / 10) as new_grand_finale_points,
    ss.judges_score_category_weight,
    ss.eliminations_category_weight,
    ss.bonus_picks_category_weight
  from public.weekly_manager_scores wms
  join public.scoring_settings ss on ss.league_id = wms.league_id
)
update public.weekly_manager_scores wms
set
  roster_points = rescaled.new_roster_points,
  prediction_points = rescaled.new_prediction_points,
  grand_finale_points = rescaled.new_grand_finale_points,
  total_points = round(
    rescaled.new_roster_points * rescaled.judges_score_category_weight
    + rescaled.new_prediction_points * rescaled.eliminations_category_weight
    + rescaled.new_grand_finale_points * rescaled.bonus_picks_category_weight
  )
from rescaled
where wms.id = rescaled.id;

commit;
