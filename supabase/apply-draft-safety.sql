-- Incremental apply for draft safety: membership freeze while a draft is in
-- progress, commissioner reset / undo-any-pick / per-member autopilot.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the source of truth for a greenfield apply.

create or replace function public.join_league(p_invite_code text)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  select * into v_league
  from public.leagues
  where invite_code = trim(upper(p_invite_code));

  if not found then
    raise exception 'Invite code not found';
  end if;

  if v_league.draft_status = 'in_progress' then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'manager')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end;
$$;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.is_league_commissioner(p_league_id) then
    raise exception 'Commissioners can''t leave their own league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;
end;
$$;

create or replace function public.remove_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can remove a member';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use Leave League to remove yourself';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = p_user_id and role != 'commissioner';

  if not found then
    raise exception 'That person is not a removable member of this league';
  end if;
end;
$$;

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
  p_bonus_picks_first_place_points numeric,
  p_bonus_picks_second_place_points numeric,
  p_bonus_picks_third_place_points numeric,
  p_bonus_picks_fourth_place_points numeric,
  p_bonus_picks_fifth_place_points numeric
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

create or replace function public.undo_last_pick(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_pick public.draft_picks;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can undo a pick';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Can only undo a pick while the draft is in progress';
  end if;

  select * into v_pick
  from public.draft_picks
  where league_id = p_league_id
  order by pick_number desc
  limit 1
  for update;

  if not found then
    raise exception 'No picks to undo';
  end if;

  delete from public.draft_picks where id = v_pick.id;

  update public.leagues
  set current_turn_started_at = now()
  where id = p_league_id;
end;
$$;

create or replace function public.set_member_draft_autopilot(
  p_league_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can set autopilot for another member';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'completed'
  ) then
    raise exception 'Draft is already over';
  end if;

  update public.league_members
  set draft_autopilot = p_enabled
  where league_id = p_league_id and user_id = p_user_id;

  if not found then
    raise exception 'That person is not a member of this league';
  end if;

  return p_enabled;
end;
$$;

create or replace function public.reset_draft(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can reset the draft';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status = 'not_started' then
    raise exception 'The draft has not started';
  end if;

  delete from public.weekly_manager_scores where league_id = p_league_id;
  delete from public.waiver_claims where league_id = p_league_id;
  delete from public.roster_slots where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;

  update public.leagues
  set draft_status = 'not_started',
      current_turn_started_at = null
  where id = p_league_id;
end;
$$;

drop function if exists public.undo_last_auto_pick(uuid);

revoke execute on function public.undo_last_pick(uuid) from public;
revoke execute on function public.set_member_draft_autopilot(uuid, uuid, boolean) from public;
revoke execute on function public.reset_draft(uuid) from public;
grant execute on function public.undo_last_pick(uuid) to authenticated;
grant execute on function public.set_member_draft_autopilot(uuid, uuid, boolean) to authenticated;
grant execute on function public.reset_draft(uuid) to authenticated;
