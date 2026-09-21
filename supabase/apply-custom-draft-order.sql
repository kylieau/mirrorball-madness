-- Commissioner-set custom draft order (all rounds)
--
-- Snake pairs pick i with pick 2N+1-i, which is only fair when value falls
-- roughly linearly across the board. A draft held after Week 1 has no such
-- luck: it is already obvious which couples are worthless, so the end seats
-- are forced to absorb a known dud. This adds a third draft_type, 'custom',
-- where the commissioner names the manager for every pick themselves.
--
-- Strictly additive: snake and linear leagues take the identical code path
-- they take today, and custom_pick_order stays null for them.
--
-- Run in the Supabase Dashboard SQL Editor, then regenerate
-- src/lib/supabase/types.ts.

begin;

-- Dropped by lookup rather than by name: the original is an inline check, so
-- its name is whatever Postgres generated.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'leagues'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%draft_type%'
  loop
    execute format('alter table public.leagues drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.leagues
  add constraint leagues_draft_type_check
  check (draft_type in ('snake', 'linear', 'custom'));

-- custom_pick_order[pick_number] = user_id. An array rather than its own
-- table because it is read once per pick from the already-locked leagues row.
alter table public.leagues
  add column if not exists custom_pick_order uuid[];

create or replace function public.set_custom_draft_order(p_league_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_member_count int;
  v_picks_each int;
begin
  select * into v_league from public.leagues where id = p_league_id for update;

  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can set the draft order';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.draft_status <> 'not_started' then
    raise exception 'Draft order can only be set before the draft starts';
  end if;

  select count(*) into v_member_count from public.league_members where league_id = p_league_id;

  if coalesce(array_length(p_user_ids, 1), 0) = 0
     or coalesce(array_length(p_user_ids, 1), 0) % v_member_count <> 0 then
    raise exception 'Order must give every manager the same number of picks';
  end if;

  v_picks_each := array_length(p_user_ids, 1) / v_member_count;

  if exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and (select count(*) from unnest(p_user_ids) as u where u = m.user_id) <> v_picks_each
  ) then
    raise exception 'Order must give every manager the same number of picks';
  end if;

  if exists (
    select 1 from unnest(p_user_ids) as u
    where not exists (
      select 1 from public.league_members lm
      where lm.league_id = p_league_id and lm.user_id = u
    )
  ) then
    raise exception 'Order includes someone who is not a member of this league';
  end if;

  update public.leagues
  set draft_type = 'custom',
      custom_pick_order = p_user_ids
  where id = p_league_id;
end;
$$;

revoke execute on function public.set_custom_draft_order(uuid, uuid[]) from public;
grant execute on function public.set_custom_draft_order(uuid, uuid[]) to authenticated;

-- Clears a stale sequence when switching away from 'custom'.
create or replace function public.update_league_settings(
  p_league_id uuid,
  p_waiver_mode text,
  p_waiver_claim_method text,
  p_pick_time_limit_seconds int,
  p_prediction_lock_hours_before_air numeric,
  p_draft_type text,
  p_draft_scheduled_at timestamptz
)
returns public.leagues
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can update league settings';
  end if;

  -- draft_type/draft_scheduled_at only take effect pre-draft: changing the
  -- pick-order math or the scheduled time after picks are already underway
  -- would corrupt whose-turn-it-is for a draft already in progress.
  update public.leagues
  set
    waiver_mode = p_waiver_mode,
    waiver_claim_method = p_waiver_claim_method,
    pick_time_limit_seconds = p_pick_time_limit_seconds,
    prediction_lock_hours_before_air = p_prediction_lock_hours_before_air,
    draft_type = case when draft_status = 'not_started' then p_draft_type else draft_type end,
    -- Switching away from 'custom' drops the stale sequence, so a later switch
    -- back cannot silently reuse an order built for a different member list.
    custom_pick_order = case
      when draft_status = 'not_started' and p_draft_type <> 'custom' then null
      else custom_pick_order
    end,
    draft_scheduled_at = case when draft_status = 'not_started' then p_draft_scheduled_at else draft_scheduled_at end
  where id = p_league_id
  returning * into v_league;

  return v_league;
end;
$$;

-- Validates the sequence now that roster_size fixes the round count.
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

  -- A custom order is a full pick-by-pick sequence, so it can only be checked
  -- here, where roster_size (and therefore the round count) first exists.
  -- Membership or the active cast may have moved since it was set.
  if v_league.draft_type = 'custom' then
    if coalesce(array_length(v_league.custom_pick_order, 1), 0) <> v_member_count * v_roster_size then
      raise exception 'Custom draft order does not cover every pick — set it again in the draft lobby';
    end if;

    if exists (
      select 1 from public.league_members m
      where m.league_id = p_league_id
        and (select count(*) from unnest(v_league.custom_pick_order) as u where u = m.user_id)
            <> v_roster_size
    ) then
      raise exception 'Custom draft order must give every manager exactly % picks', v_roster_size;
    end if;
  end if;

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

-- Turn resolution: custom names the manager outright.
create or replace function public.record_draft_pick(
  p_league_id uuid,
  p_couple_id uuid,
  p_manager_id uuid,
  p_auto_source text
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

  -- Custom order names the manager for each pick outright; snake goes 1..N on
  -- odd rounds and N..1 on even ones; linear repeats 1..N every round.
  if v_league.draft_type = 'custom' then
    v_expected_manager := v_league.custom_pick_order[v_next_pick];
  else
    if v_league.draft_type = 'linear' or v_round % 2 = 1 then
      v_draft_position_needed := v_position_in_round;
    else
      v_draft_position_needed := v_member_count - v_position_in_round + 1;
    end if;

    select user_id into v_expected_manager
    from public.league_members
    where league_id = p_league_id and draft_position = v_draft_position_needed;
  end if;

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

  insert into public.draft_picks (league_id, couple_id, manager_id, round, pick_number, is_auto, auto_source)
  values (p_league_id, p_couple_id, p_manager_id, v_round, v_next_pick, p_auto_source is not null, p_auto_source)
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
        (select min(w.week_number)
         from public.competition_weeks w
         where w.season_id = public.active_season_id()
           and (select min(e.airs_at) from public.episodes e where e.week_id = w.id) > now()),
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

revoke execute on function public.record_draft_pick(uuid, uuid, uuid, text) from public, authenticated;

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
  v_auto_source text;
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

  if v_league.draft_type = 'custom' then
    v_expected_manager := v_league.custom_pick_order[v_next_pick];

    select draft_autopilot into v_autopilot
    from public.league_members
    where league_id = p_league_id and user_id = v_expected_manager;
  else
    if v_league.draft_type = 'linear' or v_round % 2 = 1 then
      v_draft_position_needed := v_position_in_round;
    else
      v_draft_position_needed := v_member_count - v_position_in_round + 1;
    end if;

    select user_id, draft_autopilot
      into v_expected_manager, v_autopilot
    from public.league_members
    where league_id = p_league_id and draft_position = v_draft_position_needed;
  end if;

  if v_expected_manager is null then
    raise exception 'It is not your turn to pick';
  end if;

  v_turn_started := coalesce(v_league.current_turn_started_at, now());
  if not coalesce(v_autopilot, false)
     and now() < v_turn_started + (v_league.pick_time_limit_seconds * interval '1 second') then
    raise exception 'Not eligible for an auto-pick yet';
  end if;

  -- The on-the-clock manager's own queue first (definer bypasses its
  -- owner-only RLS): highest-ranked couple still active and undrafted.
  select c.id into v_couple_id
  from public.draft_queues q
  cross join lateral unnest(q.couple_ids) with ordinality as u(couple_id, pos)
  join public.couples c on c.id = u.couple_id
  where q.league_id = p_league_id
    and q.user_id = v_expected_manager
    and c.season_id = public.active_season_id()
    and c.status = 'active'
    and not exists (
      select 1 from public.draft_picks dp
      where dp.league_id = p_league_id and dp.couple_id = c.id
    )
  order by u.pos
  limit 1;

  v_auto_source := 'queue';

  if v_couple_id is null then
    v_auto_source := 'random';

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
  end if;

  if v_couple_id is null then
    raise exception 'No eligible couples remaining';
  end if;

  return public.record_draft_pick(p_league_id, v_couple_id, v_expected_manager, v_auto_source);
end;
$$;

commit;
