-- Removes Grand Finale's copy of the placement bonus (it paid out for the
-- same roster-luck event Dance Card already rewards, not anything Grand
-- Finale's full-order prediction actually measures) and rebalances the
-- full-order-prediction point values to consume the budget that frees up
-- (offline Monte Carlo re-run, no live data needed — see
-- scripts/monte-carlo-calibration/run.mjs). Dance Card's own placement bonus
-- (first_place_points..fifth_place_points) is untouched.
--
-- Run this in the Supabase Dashboard SQL Editor, then regenerate types.ts:
--   npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts

alter table public.scoring_settings
  drop column bonus_picks_first_place_points,
  drop column bonus_picks_second_place_points,
  drop column bonus_picks_third_place_points,
  drop column bonus_picks_fourth_place_points,
  drop column bonus_picks_fifth_place_points;

alter table public.scoring_settings
  alter column bonus_picks_points_per_correct set default 207;

-- update_scoring_categories drops 5 params (the bonus_picks_*_place_points
-- five), so create or replace can't be used — it can't change a function's
-- parameter list. Drop the old 27-param version first.
drop function public.update_scoring_categories(
  uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, text
);

create function public.update_scoring_categories(
  p_league_id uuid,
  p_judges_score_category_enabled boolean,
  p_eliminations_category_enabled boolean,
  p_bonus_picks_category_enabled boolean,
  p_judges_score_category_weight numeric,
  p_eliminations_category_weight numeric,
  p_bonus_picks_category_weight numeric,
  p_judges_score_starts_week int,
  p_bonus_picks_scoring_method text,
  p_bonus_picks_distance_penalty numeric,
  p_bonus_picks_tier_size int,
  p_judges_score_multiplier numeric,
  p_survival_points numeric,
  p_first_place_points numeric,
  p_second_place_points numeric,
  p_third_place_points numeric,
  p_elimination_prediction_points numeric,
  p_top_scorer_prediction_points numeric,
  p_bonus_picks_points_per_correct numeric,
  p_fourth_place_points numeric,
  p_fifth_place_points numeric,
  p_bonus_picks_tier_pay_style text
)
returns public.scoring_settings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_settings public.scoring_settings;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update scoring categories';
  end if;

  -- Turning Dance Card off mid-draft would make every remaining pick fail
  -- record_draft_pick's Dance Card check and strand the draft.
  if not p_judges_score_category_enabled and exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Dance Card can''t be turned off while the draft is in progress';
  end if;

  update public.scoring_settings
  set
    judges_score_category_enabled = p_judges_score_category_enabled,
    eliminations_category_enabled = p_eliminations_category_enabled,
    bonus_picks_category_enabled = p_bonus_picks_category_enabled,
    judges_score_category_weight = p_judges_score_category_weight,
    eliminations_category_weight = p_eliminations_category_weight,
    bonus_picks_category_weight = p_bonus_picks_category_weight,
    judges_score_starts_week = p_judges_score_starts_week,
    bonus_picks_scoring_method = p_bonus_picks_scoring_method,
    bonus_picks_distance_penalty = p_bonus_picks_distance_penalty,
    bonus_picks_tier_size = p_bonus_picks_tier_size,
    bonus_picks_tier_pay_style = p_bonus_picks_tier_pay_style,
    -- Right-hand sides here still see the pre-update row, even though
    -- judges_score_multiplier is also being overwritten in this same
    -- statement — so this correctly flags "did the commissioner just change
    -- it" without a separate select.
    judges_score_multiplier_customized = judges_score_multiplier_customized
      or (judges_score_multiplier is distinct from p_judges_score_multiplier),
    judges_score_multiplier = p_judges_score_multiplier,
    survival_points = p_survival_points,
    first_place_points = p_first_place_points,
    second_place_points = p_second_place_points,
    third_place_points = p_third_place_points,
    fourth_place_points = p_fourth_place_points,
    fifth_place_points = p_fifth_place_points,
    elimination_prediction_points = p_elimination_prediction_points,
    top_scorer_prediction_points = p_top_scorer_prediction_points,
    bonus_picks_points_per_correct = p_bonus_picks_points_per_correct,
    scoring_configured = true
  where league_id = p_league_id
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke execute on function public.update_scoring_categories(
  uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) from public;
grant execute on function public.update_scoring_categories(
  uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

-- Existing leagues: checked live data first (5 real leagues, all
-- bonus_picks_category_enabled, all uniformly at the OLD calibrated
-- defaults for their method — distance_based/200/50 in every case here — and
-- zero placement-bonus points have ever paid out yet, since Season 35's
-- finale hasn't happened). Bulk-update, matched per method+pay-style so any
-- commissioner who *did* customize a value (i.e. it's not sitting at the old
-- default) is left untouched rather than silently overwritten.
update public.scoring_settings
set
  bonus_picks_points_per_correct = case
    when bonus_picks_scoring_method = 'exact_position' and bonus_picks_points_per_correct = 257 then 264
    when bonus_picks_scoring_method = 'distance_based' and bonus_picks_points_per_correct = 200 then 207
    when bonus_picks_scoring_method = 'band_tier' and bonus_picks_tier_pay_style = 'equal' and bonus_picks_points_per_correct = 162 then 166
    when bonus_picks_scoring_method = 'band_tier' and bonus_picks_tier_pay_style = 'graded' and bonus_picks_points_per_correct = 252 then 259
    else bonus_picks_points_per_correct
  end,
  bonus_picks_distance_penalty = case
    when bonus_picks_scoring_method = 'distance_based' and bonus_picks_distance_penalty = 50 then 52
    else bonus_picks_distance_penalty
  end
where bonus_picks_category_enabled;
