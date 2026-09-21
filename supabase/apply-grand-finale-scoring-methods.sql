-- Incremental apply: Grand Finale scoring methods, recalibrated.
--   * distance_based becomes the default method (new leagues via create_league,
--     and every existing league is switched to it below).
--   * binary_tier (top-N only) is replaced by band_tier: the cast is split
--     into bands of bonus_picks_tier_size couples and a couple pays when its
--     predicted band matches its actual band, with an equal or graded pay style.
--   * bonus_picks_points_per_correct default drops 257 -> 200 (the
--     distance_based calibration; exact_position stays 257 when picked).
-- Overwrites every league's Grand Finale method and points. Already-scored
-- weekly_manager_scores are not recomputed.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the source of truth for a greenfield apply.

alter table public.scoring_settings
  add column if not exists bonus_picks_tier_pay_style text not null default 'equal'
    check (bonus_picks_tier_pay_style in ('equal', 'graded'));

alter table public.scoring_settings drop constraint if exists bonus_picks_config_required;
alter table public.scoring_settings drop constraint if exists scoring_settings_bonus_picks_scoring_method_check;

update public.scoring_settings set bonus_picks_scoring_method = 'band_tier' where bonus_picks_scoring_method = 'binary_tier';

alter table public.scoring_settings
  add constraint scoring_settings_bonus_picks_scoring_method_check
    check (bonus_picks_scoring_method in ('exact_position', 'distance_based', 'band_tier'));

alter table public.scoring_settings alter column bonus_picks_points_per_correct set default 200;

comment on column public.scoring_settings.bonus_picks_tier_size is
  'couples per band (3 = 1st-3rd, 4th-6th, ...); only used by band_tier';
comment on column public.scoring_settings.bonus_picks_tier_pay_style is
  'graded: lower bands pay 75/50/25% (floor 25%); only used by band_tier';

-- Every league moves to the calibrated distance_based default.
update public.scoring_settings
set bonus_picks_scoring_method = 'distance_based',
    bonus_picks_distance_penalty = 50,
    bonus_picks_points_per_correct = 200,
    bonus_picks_tier_pay_style = 'equal';

alter table public.scoring_settings
  add constraint bonus_picks_config_required check (
    (not bonus_picks_category_enabled) or (
      bonus_picks_scoring_method is not null
      and (bonus_picks_scoring_method != 'distance_based' or bonus_picks_distance_penalty is not null)
      and (bonus_picks_scoring_method != 'band_tier' or bonus_picks_tier_size is not null)
    )
  );

drop function if exists public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);

create or replace function public.create_league(
  p_name text,
  p_dance_card_enabled boolean default true,
  p_curtain_call_enabled boolean default true,
  p_grand_finale_enabled boolean default true
)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L to avoid ambiguity
  v_code text;
  v_i int;
  v_premiere_airs_at timestamptz;
  v_grand_finale_enabled boolean;
begin
  if trim(p_name) = '' then
    raise exception 'League name is required';
  end if;

  -- Grand Finale's deadline is derived from the Hard Deadline (see
  -- effective_grand_finale_deadline below), which resolves to nothing until
  -- a real episode exists — so enabling it before a season's Week 1 is
  -- scheduled would leave it permanently locked with no honest deadline.
  select min(e.airs_at) into v_premiere_airs_at
  from public.episodes e
  join public.competition_weeks w on w.id = e.week_id
  where w.season_id = public.active_season_id() and w.week_number = 1;
  v_grand_finale_enabled := p_grand_finale_enabled and v_premiere_airs_at is not null;

  if not (p_dance_card_enabled or p_curtain_call_enabled or v_grand_finale_enabled) then
    raise exception 'At least one scoring module must be enabled';
  end if;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;

  insert into public.leagues (name, invite_code, commissioner_id)
  values (trim(p_name), v_code, auth.uid())
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'commissioner');

  -- The commissioner explicitly reviewed these toggles during creation
  -- (unlike the old name-only flow), so scoring_configured is true right
  -- away — no post-creation "finish setup" prompt for new leagues.
  insert into public.scoring_settings (
    league_id,
    judges_score_category_enabled,
    eliminations_category_enabled,
    bonus_picks_category_enabled,
    bonus_picks_scoring_method,
    bonus_picks_distance_penalty,
    scoring_configured
  )
  values (
    v_league.id,
    p_dance_card_enabled,
    p_curtain_call_enabled,
    v_grand_finale_enabled,
    case when v_grand_finale_enabled then 'distance_based' end,
    case when v_grand_finale_enabled then 50 end,
    true
  );

  return v_league;
end;
$$;

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
  p_bonus_picks_first_place_points numeric,
  p_bonus_picks_second_place_points numeric,
  p_bonus_picks_third_place_points numeric,
  p_bonus_picks_fourth_place_points numeric,
  p_bonus_picks_fifth_place_points numeric,
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
    bonus_picks_first_place_points = p_bonus_picks_first_place_points,
    bonus_picks_second_place_points = p_bonus_picks_second_place_points,
    bonus_picks_third_place_points = p_bonus_picks_third_place_points,
    bonus_picks_fourth_place_points = p_bonus_picks_fourth_place_points,
    bonus_picks_fifth_place_points = p_bonus_picks_fifth_place_points,
    scoring_configured = true
  where league_id = p_league_id
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke execute on function public.create_league(text, boolean, boolean, boolean) from public;
grant execute on function public.create_league(text, boolean, boolean, boolean) to authenticated;
revoke execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.update_scoring_categories(uuid, boolean, boolean, boolean, numeric, numeric, numeric, int, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
