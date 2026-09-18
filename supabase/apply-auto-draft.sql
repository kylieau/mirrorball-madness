-- Incremental apply for randomized auto-draft (v1).
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the source of truth for a greenfield apply.

alter table public.leagues
  add column if not exists current_turn_started_at timestamptz;

alter table public.league_members
  add column if not exists draft_autopilot boolean not null default false;

alter table public.draft_picks
  add column if not exists is_auto boolean not null default false;

comment on column public.leagues.current_turn_started_at is
  'Server clock for whoever is on the clock. Set when the draft starts and reset after every pick.';
comment on column public.league_members.draft_autopilot is
  'Sit-out: make_auto_draft_pick may fire on this manager turn without waiting for the pick clock.';
comment on column public.draft_picks.is_auto is
  'True when make_auto_draft_pick placed this pick (timeout or autopilot).';

create or replace function public.start_draft(p_league_id uuid)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_couple_count int;
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

  select count(*) into v_couple_count
  from public.couples
  where season_id = public.active_season_id();
  if v_member_count > v_couple_count then
    raise exception 'Not enough couples for every member to get at least one';
  end if;

  -- roster_size is the even split (integer division), computed here rather
  -- than commissioner-set. Any remainder couples are left undrafted for the
  -- season rather than handed out unevenly. current_turn_started_at starts
  -- the first pick clock; this function never places a pick.
  update public.leagues
  set draft_status = 'in_progress',
      roster_size = v_couple_count / v_member_count,
      current_turn_started_at = now()
  where id = p_league_id
  returning * into v_league;

  return v_league;
end;
$$;

create or replace function public.record_draft_pick(
  p_league_id uuid,
  p_couple_id uuid,
  p_manager_id uuid,
  p_is_auto boolean
)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_total_slots int;
  v_next_pick int;
  v_round int;
  v_position_in_round int;
  v_draft_position_needed int;
  v_expected_manager uuid;
  v_pick public.draft_picks;
begin
  select * into v_league from public.leagues where id = p_league_id;

  if not found then
    raise exception 'League not found';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Draft is not in progress';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  v_total_slots := v_member_count * v_league.roster_size;
  v_next_pick := (select count(*) from public.draft_picks where league_id = p_league_id) + 1;

  if v_next_pick > v_total_slots then
    raise exception 'Draft is already complete';
  end if;

  v_round := ((v_next_pick - 1) / v_member_count) + 1;
  v_position_in_round := v_next_pick - (v_round - 1) * v_member_count;

  -- Snake order: odd rounds go 1..N, even rounds go N..1. Linear repeats
  -- 1..N every round.
  if v_league.draft_type = 'linear' or v_round % 2 = 1 then
    v_draft_position_needed := v_position_in_round;
  else
    v_draft_position_needed := v_member_count - v_position_in_round + 1;
  end if;

  select user_id into v_expected_manager
  from public.league_members
  where league_id = p_league_id and draft_position = v_draft_position_needed;

  if v_expected_manager is null or v_expected_manager <> p_manager_id then
    raise exception 'It is not your turn to pick';
  end if;

  if not exists (
    select 1 from public.couples where id = p_couple_id and season_id = public.active_season_id()
  ) then
    raise exception 'That couple is not part of the current season';
  end if;

  if exists (
    select 1 from public.couples where id = p_couple_id and status <> 'active'
  ) then
    raise exception 'That couple is not available';
  end if;

  if exists (select 1 from public.draft_picks where league_id = p_league_id and couple_id = p_couple_id) then
    raise exception 'That couple has already been drafted';
  end if;

  insert into public.draft_picks (league_id, couple_id, manager_id, round, pick_number, is_auto)
  values (p_league_id, p_couple_id, p_manager_id, v_round, v_next_pick, p_is_auto)
  returning * into v_pick;

  if v_next_pick = v_total_slots then
    update public.leagues
    set draft_status = 'completed', current_turn_started_at = now()
    where id = p_league_id;

    insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
    select league_id, manager_id, row_number() over (partition by manager_id order by pick_number), couple_id, 'draft', 1
    from public.draft_picks
    where league_id = p_league_id;

    -- Freezes the auto-advanced Hard Deadline (effective_hard_deadline_week)
    -- into judges_score_starts_week now that the draft has actually
    -- completed, so a real roster exists from this point on.
    update public.scoring_settings
    set judges_score_starts_week = greatest(
      judges_score_starts_week,
      coalesce(
        (select min(week_number) from public.episodes
         where season_id = public.active_season_id() and airs_at > now()),
        judges_score_starts_week
      )
    )
    where league_id = p_league_id;
  else
    -- Fresh clock for the next manager so one timeout cannot drain the board.
    update public.leagues
    set current_turn_started_at = now()
    where id = p_league_id;
  end if;

  return v_pick;
end;
$$;

revoke execute on function public.record_draft_pick(uuid, uuid, uuid, boolean) from public, authenticated;

create or replace function public.make_draft_pick(p_league_id uuid, p_couple_id uuid)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  -- Serialize concurrent picks on this league (same lock auto-pick takes).
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then
    raise exception 'League not found';
  end if;

  if auth.uid() is null then
    raise exception 'It is not your turn to pick';
  end if;

  return public.record_draft_pick(p_league_id, p_couple_id, auth.uid(), false);
end;
$$;

-- Places one uniformly-random eligible remaining couple for the manager on
-- the clock. Any league member may call this so a started draft still moves
-- when the picker never joined the room. Eligible when that manager has
-- draft_autopilot or the server pick clock has expired. One pick per call —
-- the next manager gets a fresh clock (unless they are also on autopilot).
-- Does not start a draft.
create or replace function public.make_auto_draft_pick(p_league_id uuid)
returns public.draft_picks
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_total_slots int;
  v_next_pick int;
  v_round int;
  v_position_in_round int;
  v_draft_position_needed int;
  v_expected_manager uuid;
  v_autopilot boolean;
  v_turn_started timestamptz;
  v_couple_id uuid;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Draft is not in progress';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  v_total_slots := v_member_count * v_league.roster_size;
  v_next_pick := (select count(*) from public.draft_picks where league_id = p_league_id) + 1;

  if v_next_pick > v_total_slots then
    raise exception 'Draft is already complete';
  end if;

  v_round := ((v_next_pick - 1) / v_member_count) + 1;
  v_position_in_round := v_next_pick - (v_round - 1) * v_member_count;

  if v_league.draft_type = 'linear' or v_round % 2 = 1 then
    v_draft_position_needed := v_position_in_round;
  else
    v_draft_position_needed := v_member_count - v_position_in_round + 1;
  end if;

  select user_id, draft_autopilot
    into v_expected_manager, v_autopilot
  from public.league_members
  where league_id = p_league_id and draft_position = v_draft_position_needed;

  if v_expected_manager is null then
    raise exception 'It is not your turn to pick';
  end if;

  v_turn_started := coalesce(v_league.current_turn_started_at, now());
  if not coalesce(v_autopilot, false)
     and now() < v_turn_started + (v_league.pick_time_limit_seconds * interval '1 second') then
    raise exception 'Not eligible for an auto-pick yet';
  end if;

  select c.id into v_couple_id
  from public.couples c
  where c.season_id = public.active_season_id()
    and c.status = 'active'
    and not exists (
      select 1 from public.draft_picks dp
      where dp.league_id = p_league_id and dp.couple_id = c.id
    )
  order by random()
  limit 1;

  if v_couple_id is null then
    raise exception 'No eligible couples remaining';
  end if;

  return public.record_draft_pick(p_league_id, v_couple_id, v_expected_manager, true);
end;
$$;

create or replace function public.set_draft_autopilot(p_league_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'completed'
  ) then
    raise exception 'Draft is already over';
  end if;

  update public.league_members
  set draft_autopilot = p_enabled
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;

  return p_enabled;
end;
$$;

-- Commissioner-only undo of the single most recent auto-pick, and only while
-- the draft is still in progress (roster_slots have not been seeded).
create or replace function public.undo_last_auto_pick(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_pick public.draft_picks;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can undo an auto-pick';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;

  if not found then
    raise exception 'League not found';
  end if;

  if v_league.draft_status <> 'in_progress' then
    raise exception 'Can only undo an auto-pick while the draft is in progress';
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

  if not v_pick.is_auto then
    raise exception 'The last pick was not an auto-pick';
  end if;

  delete from public.draft_picks where id = v_pick.id;

  update public.leagues
  set current_turn_started_at = now()
  where id = p_league_id;
end;
$$;

revoke execute on function public.start_draft(uuid) from public;
revoke execute on function public.make_draft_pick(uuid, uuid) from public;
revoke execute on function public.make_auto_draft_pick(uuid) from public;
revoke execute on function public.set_draft_autopilot(uuid, boolean) from public;
revoke execute on function public.undo_last_auto_pick(uuid) from public;
grant execute on function public.start_draft(uuid) to authenticated;
grant execute on function public.make_draft_pick(uuid, uuid) to authenticated;
grant execute on function public.make_auto_draft_pick(uuid) to authenticated;
grant execute on function public.set_draft_autopilot(uuid, boolean) to authenticated;
grant execute on function public.undo_last_auto_pick(uuid) to authenticated;

