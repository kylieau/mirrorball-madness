-- start_draft now sizes rosters from active couples only, so a draft started
-- after an elimination can actually complete.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the source of truth for a greenfield apply.

create or replace function public.start_draft(p_league_id uuid)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_couple_count int;
  v_roster_size int;
  v_calibrated_multiplier numeric;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can start the draft';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'not_started' then
    raise exception 'Draft has already been started';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  if v_member_count < 2 then
    raise exception 'Need at least 2 members to start the draft';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and draft_position is null
  ) then
    raise exception 'Draft order has not been set for all members yet';
  end if;

  -- Only active couples: record_draft_pick rejects anyone else, so counting
  -- an already-eliminated couple would size rosters for picks that can never
  -- be made and leave the draft one pick short of complete.
  select count(*) into v_couple_count
  from public.couples
  where season_id = public.active_season_id() and status = 'active';
  if v_member_count > v_couple_count then
    raise exception 'Not enough couples for every member to get at least one';
  end if;

  -- roster_size is the even split (integer division), computed here rather
  -- than commissioner-set. Any remainder couples are left undrafted for the
  -- season rather than handed out unevenly. current_turn_started_at starts
  -- the first pick clock; this function never places a pick.
  v_roster_size := v_couple_count / v_member_count;

  update public.leagues
  set draft_status = 'in_progress',
      roster_size = v_roster_size,
      current_turn_started_at = now()
  where id = p_league_id
  returning * into v_league;

  -- Seed judges_score_multiplier from the roster-size-keyed calibration
  -- table now that roster_size is fixed for the season — but only while the
  -- commissioner hasn't customized it themselves (see
  -- judges_score_multiplier_customized on scoring_settings). Clamp to the
  -- nearest defined roster size if this season's split falls outside the
  -- table's swept range.
  select judges_score_multiplier_default into v_calibrated_multiplier
  from public.dance_card_calibration
  where roster_size = (
    select roster_size from public.dance_card_calibration
    order by abs(roster_size - v_roster_size), roster_size
    limit 1
  );

  if v_calibrated_multiplier is not null then
    update public.scoring_settings
    set judges_score_multiplier = v_calibrated_multiplier
    where league_id = p_league_id and not judges_score_multiplier_customized;
  end if;

  return v_league;
end;
$$;
