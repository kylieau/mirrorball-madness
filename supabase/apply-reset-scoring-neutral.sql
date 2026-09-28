-- Reset to Neutral can save the roster-size calibration without leaving
-- judges_score_multiplier_customized set, so a later start_draft may seed
-- again. The draft-complete multiplier lock is unchanged: a different value
-- is still rejected once leagues.draft_status = 'completed'.
--
-- League Settings does the even weight split in the client
-- (src/lib/scoring-neutral.ts). This function still stores the weights it
-- is given. Same signature as the live function, so create or replace is
-- enough. Run once in the Supabase Dashboard SQL Editor. No types.ts change.

create or replace function public.update_scoring_categories(
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
  p_bonus_picks_tier_pay_style text,
  p_curtain_call_near_miss_enabled boolean
)
returns public.scoring_settings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_settings public.scoring_settings;
  v_current public.scoring_settings;
  v_deadline timestamptz;
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

  select * into v_current from public.scoring_settings where league_id = p_league_id;
  if not found then
    raise exception 'Scoring settings not found for this league';
  end if;

  -- Everything except judges_score_multiplier locks together the moment the
  -- Season Clock anchor passes (see the comment above scoring_settings) —
  -- one shared trigger, not per category, so a commissioner can never see
  -- one category's real results before finalizing another's weight. A no-op
  -- resave (every value already matches) still succeeds, since the Settings
  -- form always round-trips every field regardless of what actually changed.
  -- judges_score_multiplier has its own lock, below: draft complete, not
  -- this deadline.
  v_deadline := public.effective_grand_finale_deadline(p_league_id);
  if not v_current.locking_exempt and v_deadline is not null and now() >= v_deadline then
    if (
      p_judges_score_category_enabled, p_eliminations_category_enabled, p_bonus_picks_category_enabled,
      p_judges_score_category_weight, p_eliminations_category_weight, p_bonus_picks_category_weight,
      p_judges_score_starts_week, p_bonus_picks_scoring_method, p_bonus_picks_distance_penalty,
      p_bonus_picks_tier_size, p_bonus_picks_tier_pay_style, p_survival_points,
      p_first_place_points, p_second_place_points, p_third_place_points, p_fourth_place_points, p_fifth_place_points,
      p_elimination_prediction_points, p_top_scorer_prediction_points, p_bonus_picks_points_per_correct,
      p_curtain_call_near_miss_enabled
    ) is distinct from (
      v_current.judges_score_category_enabled, v_current.eliminations_category_enabled, v_current.bonus_picks_category_enabled,
      v_current.judges_score_category_weight, v_current.eliminations_category_weight, v_current.bonus_picks_category_weight,
      v_current.judges_score_starts_week, v_current.bonus_picks_scoring_method, v_current.bonus_picks_distance_penalty,
      v_current.bonus_picks_tier_size, v_current.bonus_picks_tier_pay_style, v_current.survival_points,
      v_current.first_place_points, v_current.second_place_points, v_current.third_place_points, v_current.fourth_place_points, v_current.fifth_place_points,
      v_current.elimination_prediction_points, v_current.top_scorer_prediction_points, v_current.bonus_picks_points_per_correct,
      v_current.curtain_call_near_miss_enabled
    ) then
      raise exception 'Scoring settings are locked for the season — the Grand Finale deadline has passed';
    end if;
  end if;

  -- Draft-complete lock, independent of the Season Clock check above and of
  -- locking_exempt. A matching resave still succeeds so the rest of the
  -- form can save. start_draft writes this column itself and only runs
  -- while draft_status is not_started, so calibration is unaffected.
  if v_current.judges_score_multiplier is distinct from p_judges_score_multiplier
     and exists (
       select 1 from public.leagues
       where id = p_league_id and draft_status = 'completed'
     ) then
    raise exception 'Judges'' Score Multiplier is locked — the draft is complete';
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
    -- Right-hand sides here still see the pre-update row. Saving the
    -- roster-size calibration clears the flag so Reset to Neutral (or
    -- typing that number back) lets a later start_draft seed again. Any
    -- other change marks it customized and it stays that way. A
    -- draft-complete resave does not touch the flag — the lock above
    -- already rejects a different multiplier.
    judges_score_multiplier_customized = case
      when exists (
        select 1 from public.leagues
        where id = p_league_id and draft_status = 'completed'
      ) then judges_score_multiplier_customized
      when p_judges_score_multiplier is not distinct from (
        select c.judges_score_multiplier_default
        from public.dance_card_calibration c
        where c.roster_size = (
          select c2.roster_size
          from public.dance_card_calibration c2
          order by abs(c2.roster_size - (
            select l.roster_size from public.leagues l where l.id = p_league_id
          )), c2.roster_size
          limit 1
        )
      ) then false
      when judges_score_multiplier is distinct from p_judges_score_multiplier then true
      else judges_score_multiplier_customized
    end,
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
    curtain_call_near_miss_enabled = p_curtain_call_near_miss_enabled,
    scoring_configured = true
  where league_id = p_league_id
  returning * into v_settings;

  return v_settings;
end;
$$;
