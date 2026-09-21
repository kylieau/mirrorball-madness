-- Incremental apply for the per-manager draft queue: a private ranked list
-- that make_auto_draft_pick consults before falling back to random.
-- Run in the Supabase Dashboard SQL Editor against the live project.
-- schema.sql remains the source of truth for a greenfield apply.

alter table public.draft_picks
  add column if not exists auto_source text check (auto_source in ('queue', 'random'));

-- Existing auto-picks were all random.
update public.draft_picks set auto_source = 'random' where is_auto and auto_source is null;

create table if not exists public.draft_queues (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  couple_ids uuid[] not null default '{}',
  primary key (league_id, user_id)
);

alter table public.draft_queues enable row level security;

grant select on public.draft_queues to authenticated;

drop policy if exists "draft queues are viewable by their owner" on public.draft_queues;
create policy "draft queues are viewable by their owner"
on public.draft_queues for select
using (user_id = (select auth.uid()));

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

  return public.record_draft_pick(p_league_id, p_couple_id, auth.uid(), null);
end;
$$;

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

create or replace function public.set_draft_queue(p_league_id uuid, p_couple_ids uuid[])
returns void
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

  if (select count(distinct u) from unnest(p_couple_ids) as u)
     is distinct from coalesce(array_length(p_couple_ids, 1), 0) then
    raise exception 'A couple can only be in your queue once';
  end if;

  if exists (
    select 1 from unnest(p_couple_ids) as u
    where not exists (
      select 1 from public.couples c
      where c.id = u and c.season_id = public.active_season_id()
    )
  ) then
    raise exception 'Queue includes a couple that is not part of the current season';
  end if;

  insert into public.draft_queues (league_id, user_id, couple_ids)
  values (p_league_id, auth.uid(), p_couple_ids)
  on conflict (league_id, user_id) do update set couple_ids = excluded.couple_ids;
end;
$$;

-- The callers above now use the text signature; drop the boolean overload.
drop function if exists public.record_draft_pick(uuid, uuid, uuid, boolean);

revoke execute on function public.record_draft_pick(uuid, uuid, uuid, text) from public, authenticated;
revoke execute on function public.set_draft_queue(uuid, uuid[]) from public;
grant execute on function public.set_draft_queue(uuid, uuid[]) to authenticated;
