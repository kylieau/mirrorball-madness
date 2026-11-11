-- Trades (Kylie, 2026-11-10): managers trade couples, with points as cash.
-- A trade is a set of legs, each moving one couple or an amount of points
-- from one manager to another, so it can be uneven, one-sided or involve more
-- than two managers. Every manager in it accepts, the rest of the league then
-- has 24 hours to veto it by majority, and it takes effect at the next waiver
-- run: couples change rosters from the run's start week, and points land on
-- the latest published week. A commissioner turns Trades on (default off).
--
-- Apply after apply-recast-v2.sql and before deploying the app that offers
-- Trades. Nothing changes for a league until its commissioner turns them on.
--
-- What changes:
--   1. leagues.trades_enabled / trades_on_since; 'trade' as a roster source.
--   2. trade_offers, trade_parties, trade_legs, trade_votes. An offer is
--      private to its managers until all of them accept.
--   3. propose_trade, respond_to_trade (accept, decline, or cancel your own),
--      veto_trade, set_trades_enabled. An offer not accepted by everyone
--      within 48 hours, or by the trade deadline, expires.
--   4. A waiver run also carries out the trades that cleared their veto
--      window, before it decides claims, and runs for a league with Trades on
--      even when Recast is off.
--   5. A couple can't be in an open trade and a pending waiver claim at once:
--      whichever was submitted first holds it.

alter table public.leagues
  add column if not exists trades_enabled boolean not null default false,
  add column if not exists trades_on_since timestamptz;

alter table public.roster_slots drop constraint if exists roster_slots_source_check;
alter table public.roster_slots add constraint roster_slots_source_check
  check (source in ('draft', 'waiver', 'trade'));

alter table public.recast_cycles add column if not exists trades int not null default 0;

create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  submitted_by uuid not null references public.profiles(id),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'cancelled', 'vetoed', 'executed', 'failed', 'expired')),
  result text check (result in ('not_dancing', 'not_held', 'no_room', 'cash_cap', 'left_league', 'no_scored_week')),
  created_at timestamptz not null default now(),
  -- An offer lapses if not everyone has accepted by then. The run marks it
  -- expired; until it does, reads treat a proposed offer past this as lapsed.
  expires_at timestamptz not null default now() + interval '48 hours',
  accepted_at timestamptz,
  veto_ends_at timestamptz,
  resolved_at timestamptz,
  week_number int,
  start_week int
);
create index if not exists trade_offers_league on public.trade_offers(league_id, status);

create table if not exists public.trade_parties (
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  primary key (trade_id, manager_id)
);

create table if not exists public.trade_legs (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  leg_order int not null,
  from_manager_id uuid not null references public.profiles(id),
  to_manager_id uuid not null references public.profiles(id),
  couple_id uuid references public.couples(id),
  -- Total-points units, like a manager's season total.
  points numeric check (points > 0 and points = round(points, 2)),
  check (from_manager_id <> to_manager_id),
  check ((couple_id is null) <> (points is null)),
  unique (trade_id, leg_order)
);
create index if not exists trade_legs_couple on public.trade_legs(couple_id) where couple_id is not null;

create table if not exists public.trade_votes (
  trade_id uuid not null references public.trade_offers(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  voted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (trade_id, manager_id)
);

alter table public.trade_offers enable row level security;
alter table public.trade_parties enable row level security;
alter table public.trade_legs enable row level security;
alter table public.trade_votes enable row level security;

-- An offer is between its managers until they have all accepted; from then
-- on the league sees it, to veto it and as the record of what happened.
create or replace function public.can_view_trade(p_trade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trade_offers t
    where t.id = p_trade_id and public.is_league_member(t.league_id)
      and (
        t.status in ('accepted', 'vetoed', 'executed', 'failed')
        or exists (
          select 1 from public.trade_parties p
          where p.trade_id = t.id and p.manager_id = public.resolve_acting_league_member(t.league_id)
        )
      )
  );
$$;
revoke execute on function public.can_view_trade(uuid) from public, anon;
grant execute on function public.can_view_trade(uuid) to authenticated;

drop policy if exists "trades: own offers, and the league's accepted ones" on public.trade_offers;
create policy "trades: own offers, and the league's accepted ones"
on public.trade_offers for select using (public.can_view_trade(id));
drop policy if exists "trade parties follow their trade" on public.trade_parties;
create policy "trade parties follow their trade"
on public.trade_parties for select using (public.can_view_trade(trade_id));
drop policy if exists "trade legs follow their trade" on public.trade_legs;
create policy "trade legs follow their trade"
on public.trade_legs for select using (public.can_view_trade(trade_id));
drop policy if exists "trade votes follow their trade" on public.trade_votes;
create policy "trade votes follow their trade"
on public.trade_votes for select using (public.can_view_trade(trade_id));

revoke all on public.trade_offers, public.trade_parties, public.trade_legs, public.trade_votes from anon, authenticated;
grant select on public.trade_offers, public.trade_parties, public.trade_legs, public.trade_votes to authenticated;
grant select, insert, update, delete on public.trade_offers, public.trade_parties, public.trade_legs, public.trade_votes to service_role;

-- A league's runs began when Recast or Trades was turned on, whichever is
-- still on and came first.
create or replace function public.recast_runs_since(p_league_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    case when waiver_mode = 'waivers' then recast_on_since end,
    case when trades_enabled then trades_on_since end
  )
  from public.leagues where id = p_league_id;
$$;

-- No trades after the Semi-Finals lock: an offer has to be accepted by
-- everyone in it before the week before the Finale locks in this league.
create or replace function public.trade_deadline(p_league_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select public.lifeline_lock_at(p_league_id, w.id)
  from public.competition_weeks w
  where w.season_id = public.active_season_id()
    and w.week_number = coalesce(
      (select min(f.week_number) from public.competition_weeks f where f.season_id = w.season_id and f.is_finale),
      (select max(l.week_number) from public.competition_weeks l where l.season_id = w.season_id)
    ) - 1;
$$;
revoke execute on function public.trade_deadline(uuid) from public, anon;
grant execute on function public.trade_deadline(uuid) to authenticated, service_role;

-- How many more points a manager can send: 10% of what they have earned by
-- playing this season (every total except trade cash), less what they have
-- already sent. While an offer is being weighed, the points promised in other
-- accepted trades count as sent too.
create or replace function public.trade_cash_room(p_league_id uuid, p_manager_id uuid, p_count_accepted boolean)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(0.10 * coalesce((
           select sum(s.total_points - s.transfer_points)
           from public.weekly_manager_standings s
           join public.competition_weeks w on w.id = s.week_id
           where s.league_id = p_league_id and s.manager_id = p_manager_id and w.season_id = public.active_season_id()
         ), 0), 2)
       - coalesce((
           select sum(-a.weighted_points)
           from public.league_point_adjustments a
           join public.competition_weeks w on w.id = a.week_id
           where a.league_id = p_league_id and a.manager_id = p_manager_id and a.kind = 'trade_transfer'
             and a.weighted_points < 0 and w.season_id = public.active_season_id()
         ), 0)
       - coalesce((
           select sum(g.points)
           from public.trade_legs g
           join public.trade_offers t on t.id = g.trade_id
           where p_count_accepted and t.league_id = p_league_id and t.status = 'accepted'
             and g.from_manager_id = p_manager_id and g.points is not null
         ), 0);
$$;
revoke all on function public.trade_cash_room(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.trade_cash_available(p_league_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(public.trade_cash_room(p_league_id, public.resolve_acting_league_member(p_league_id), true), 0)
  where public.is_league_member(p_league_id);
$$;
revoke execute on function public.trade_cash_available(uuid) from public, anon;
grant execute on function public.trade_cash_available(uuid) to authenticated;

-- Where each couple in a trade lands: the spots its new manager gives up
-- first, then their open spots (a couple that went home), then spots an
-- earlier trade left empty. A couple with nowhere to go has no row here.
create or replace function public.trade_moves(p_trade_id uuid)
returns table (manager_id uuid, couple_id uuid, slot_number int)
language sql
stable
set search_path = ''
as $$
  with trade as (
    select t.id, t.league_id, l.roster_size
    from public.trade_offers t
    join public.leagues l on l.id = t.league_id
    where t.id = p_trade_id
  ), incoming as (
    select g.to_manager_id as manager_id, g.couple_id,
           row_number() over (partition by g.to_manager_id order by g.leg_order) as n
    from public.trade_legs g
    where g.trade_id = p_trade_id and g.couple_id is not null
  ), spots as (
    select rs.manager_id, rs.slot_number, 0 as kind
    from trade t
    join public.trade_legs g on g.trade_id = t.id and g.couple_id is not null
    join public.roster_slots rs on rs.league_id = t.league_id and rs.manager_id = g.from_manager_id
      and rs.couple_id = g.couple_id and rs.end_week is null
    union all
    select rs.manager_id, rs.slot_number, 1
    from trade t
    join public.trade_parties p on p.trade_id = t.id
    join public.roster_slots rs on rs.league_id = t.league_id and rs.manager_id = p.manager_id and rs.end_week is null
    join public.couples c on c.id = rs.couple_id and c.status in ('eliminated', 'withdrawn')
    union all
    select p.manager_id, s.n, 2
    from trade t
    join public.trade_parties p on p.trade_id = t.id
    cross join generate_series(1, t.roster_size) s(n)
    where not exists (
      select 1 from public.roster_slots rs
      where rs.league_id = t.league_id and rs.manager_id = p.manager_id and rs.slot_number = s.n and rs.end_week is null
    )
  ), ranked as (
    select s.manager_id, s.slot_number,
           row_number() over (partition by s.manager_id order by s.kind, s.slot_number) as n
    from spots s
  )
  select i.manager_id, i.couple_id, r.slot_number
  from incoming i
  join ranked r on r.manager_id = i.manager_id and r.n = i.n;
$$;
revoke all on function public.trade_moves(uuid) from public, anon, authenticated;

-- Why a trade can't go through as things stand, or null. At the run only
-- points already sent count against the cap, so two accepted trades are
-- judged in turn rather than against each other.
create or replace function public.trade_problem(p_trade_id uuid, p_at_run boolean)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  select league_id into v_league_id from public.trade_offers where id = p_trade_id;
  if exists (
    select 1 from public.trade_parties p
    where p.trade_id = p_trade_id and not exists (
      select 1 from public.league_members m where m.league_id = v_league_id and m.user_id = p.manager_id
    )
  ) then
    return 'left_league';
  end if;
  if exists (
    select 1 from public.trade_legs g
    where g.trade_id = p_trade_id and g.couple_id is not null and not exists (
      select 1 from public.couples c
      where c.id = g.couple_id and c.status = 'active' and c.season_id = public.active_season_id()
    )
  ) then
    return 'not_dancing';
  end if;
  if exists (
    select 1 from public.trade_legs g
    where g.trade_id = p_trade_id and g.couple_id is not null and not exists (
      select 1 from public.roster_slots rs
      where rs.league_id = v_league_id and rs.manager_id = g.from_manager_id
        and rs.couple_id = g.couple_id and rs.end_week is null
    )
  ) then
    return 'not_held';
  end if;
  if not p_at_run and exists (
    select 1 from public.trade_legs g
    join public.trade_legs other on other.couple_id = g.couple_id and other.trade_id <> g.trade_id
    join public.trade_offers t on t.id = other.trade_id
    where g.trade_id = p_trade_id and t.league_id = v_league_id and t.status = 'accepted'
  ) then
    return 'in_other_trade';
  end if;
  if (select count(*) from public.trade_moves(p_trade_id))
     <> (select count(*) from public.trade_legs where trade_id = p_trade_id and couple_id is not null) then
    return 'no_room';
  end if;
  if exists (
    select 1 from (
      select g.from_manager_id, sum(g.points) as sending
      from public.trade_legs g
      where g.trade_id = p_trade_id and g.points is not null
      group by g.from_manager_id
    ) s
    where s.sending > public.trade_cash_room(v_league_id, s.from_manager_id, not p_at_run)
  ) then
    return 'cash_cap';
  end if;
  return null;
end;
$$;
revoke all on function public.trade_problem(uuid, boolean) from public, anon, authenticated;

create or replace function public.trade_problem_text(p_problem text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_problem
    when 'left_league' then 'A manager in this trade is no longer in the league'
    when 'not_dancing' then 'A couple in this trade is no longer dancing'
    when 'not_held' then 'A couple in this trade is no longer on that roster'
    when 'in_other_trade' then 'A couple in this trade is already in a trade waiting to take effect'
    when 'no_room' then 'A manager in this trade has no roster spot for a couple they would get'
    when 'cash_cap' then 'A manager can send at most 10% of the points they have earned this season'
  end;
$$;
revoke all on function public.trade_problem_text(text) from public, anon, authenticated;

-- Whether an offer can still be made or accepted in this league.
create or replace function public.assert_trades_open(p_league_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_league public.leagues;
  v_deadline timestamptz := public.trade_deadline(p_league_id);
begin
  select * into v_league from public.leagues where id = p_league_id;
  if not v_league.trades_enabled then raise exception 'This league does not use Trades'; end if;
  if not exists (
    select 1 from public.scoring_settings where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;
  if v_deadline is null or now() >= v_deadline then raise exception 'The trade deadline has passed'; end if;
  if not exists (select 1 from public.recast_next_cycle(p_league_id) c where c.start_week is not null) then
    raise exception 'There are no more waiver runs this season';
  end if;
end;
$$;
revoke all on function public.assert_trades_open(uuid) from public, anon, authenticated;

create or replace function public.propose_trade(p_league_id uuid, p_legs jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.resolve_acting_league_member(p_league_id);
  v_trade_id uuid;
  v_problem text;
begin
  if v_team is null then raise exception 'You are not a member of this league'; end if;
  -- Serializes with the run, which holds the same lock while it decides.
  perform 1 from public.leagues where id = p_league_id for update;
  perform public.assert_trades_open(p_league_id);
  if jsonb_typeof(p_legs) is distinct from 'array' or jsonb_array_length(p_legs) = 0 then
    raise exception 'A trade has to move at least one couple';
  end if;
  if jsonb_array_length(p_legs) > 12 then raise exception 'A trade holds up to 12 parts'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_legs) e
    where e.value->>'from_manager_id' is null or e.value->>'to_manager_id' is null
       or e.value->>'from_manager_id' = e.value->>'to_manager_id'
       or (e.value->>'couple_id' is null) = (e.value->>'points' is null)
       or (e.value->>'points')::numeric <= 0
       or (e.value->>'points')::numeric <> round((e.value->>'points')::numeric, 2)
  ) then
    raise exception 'That trade is not valid';
  end if;

  insert into public.trade_offers (league_id, proposed_by, submitted_by)
  values (p_league_id, v_team, auth.uid())
  returning id into v_trade_id;
  insert into public.trade_legs (trade_id, leg_order, from_manager_id, to_manager_id, couple_id, points)
  select v_trade_id, e.ordinality::int, (e.value->>'from_manager_id')::uuid, (e.value->>'to_manager_id')::uuid,
         (e.value->>'couple_id')::uuid, (e.value->>'points')::numeric
  from jsonb_array_elements(p_legs) with ordinality e;
  insert into public.trade_parties (trade_id, manager_id, accepted_at, accepted_by)
  select v_trade_id, party.manager_id,
         case when party.manager_id = v_team then now() end,
         case when party.manager_id = v_team then auth.uid() end
  from (
    select g.from_manager_id as manager_id from public.trade_legs g where g.trade_id = v_trade_id
    union
    select g.to_manager_id from public.trade_legs g where g.trade_id = v_trade_id
  ) party;

  if not exists (select 1 from public.trade_parties where trade_id = v_trade_id and manager_id = v_team) then
    raise exception 'You have to be part of a trade you propose';
  end if;
  if not exists (select 1 from public.trade_legs where trade_id = v_trade_id and couple_id is not null) then
    raise exception 'A trade has to move at least one couple';
  end if;
  if (select count(couple_id) <> count(distinct couple_id) from public.trade_legs where trade_id = v_trade_id) then
    raise exception 'A couple can only move once in a trade';
  end if;
  if exists (
    select 1 from public.trade_legs
    where trade_id = v_trade_id and points is not null
    group by from_manager_id, to_manager_id having count(*) > 1
  ) then
    raise exception 'Put the points one manager sends another into one amount';
  end if;
  if exists (
    select 1 from public.waiver_claims wc
    join public.trade_legs g on g.trade_id = v_trade_id and g.couple_id in (wc.couple_id, wc.drop_couple_id)
    where wc.league_id = p_league_id and wc.status = 'pending'
  ) then
    raise exception 'A couple in this trade is in a pending waiver claim';
  end if;

  v_problem := public.trade_problem(v_trade_id, false);
  if v_problem is not null then raise exception '%', public.trade_problem_text(v_problem); end if;
  return v_trade_id;
end;
$$;
revoke execute on function public.propose_trade(uuid, jsonb) from public, anon;
grant execute on function public.propose_trade(uuid, jsonb) to authenticated;

-- Accept an offer, or turn it down: the proposer turning it down cancels it.
-- The last manager to accept starts the league's 24-hour veto window.
create or replace function public.respond_to_trade(p_trade_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trade_offers;
  v_team uuid;
  v_problem text;
begin
  perform 1 from public.leagues l
  join public.trade_offers t on t.league_id = l.id
  where t.id = p_trade_id
  for update of l;
  select * into v_trade from public.trade_offers where id = p_trade_id;
  v_team := public.resolve_acting_league_member(v_trade.league_id);
  if v_team is null or not exists (
    select 1 from public.trade_parties where trade_id = p_trade_id and manager_id = v_team
  ) then
    raise exception 'You are not part of this trade';
  end if;
  if v_trade.status <> 'proposed' then raise exception 'This trade is no longer open'; end if;

  if not p_accept then
    update public.trade_offers
    set status = case when v_team = proposed_by then 'cancelled' else 'declined' end, resolved_at = now()
    where id = p_trade_id
    returning status into v_trade.status;
    return v_trade.status;
  end if;

  if now() >= v_trade.expires_at then raise exception 'This offer has expired'; end if;
  perform public.assert_trades_open(v_trade.league_id);
  v_problem := public.trade_problem(p_trade_id, false);
  if v_problem is not null then raise exception '%', public.trade_problem_text(v_problem); end if;
  update public.trade_parties set accepted_at = now(), accepted_by = auth.uid()
  where trade_id = p_trade_id and manager_id = v_team and accepted_at is null;
  if not exists (select 1 from public.trade_parties where trade_id = p_trade_id and accepted_at is null) then
    update public.trade_offers
    set status = 'accepted', accepted_at = now(), veto_ends_at = now() + interval '24 hours'
    where id = p_trade_id;
    return 'accepted';
  end if;
  return 'proposed';
end;
$$;
revoke execute on function public.respond_to_trade(uuid, boolean) from public, anon;
grant execute on function public.respond_to_trade(uuid, boolean) to authenticated;

-- A veto is one vote per team outside the trade, and it stops the trade once
-- more than half of those teams have voted.
create or replace function public.veto_trade(p_trade_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trade_offers;
  v_team uuid;
begin
  perform 1 from public.leagues l
  join public.trade_offers t on t.league_id = l.id
  where t.id = p_trade_id
  for update of l;
  select * into v_trade from public.trade_offers where id = p_trade_id;
  v_team := public.resolve_acting_league_member(v_trade.league_id);
  if v_team is null then raise exception 'You are not a member of this league'; end if;
  if exists (select 1 from public.trade_parties where trade_id = p_trade_id and manager_id = v_team) then
    raise exception 'You can''t veto a trade you are part of';
  end if;
  if v_trade.status <> 'accepted' or now() >= v_trade.veto_ends_at then
    raise exception 'The veto window for this trade has closed';
  end if;

  insert into public.trade_votes (trade_id, manager_id, voted_by)
  values (p_trade_id, v_team, auth.uid())
  on conflict (trade_id, manager_id) do nothing;
  -- Both sides count the teams in the league now, so a vote doesn't outlive
  -- a team that has left.
  if (
    select count(*) from public.trade_votes v
    join public.league_members m on m.league_id = v_trade.league_id and m.user_id = v.manager_id
    where v.trade_id = p_trade_id
  ) * 2 > (
    select count(*) from public.league_members m
    where m.league_id = v_trade.league_id and not exists (
      select 1 from public.trade_parties p where p.trade_id = p_trade_id and p.manager_id = m.user_id
    )
  ) then
    update public.trade_offers set status = 'vetoed', resolved_at = now() where id = p_trade_id;
    return 'vetoed';
  end if;
  return 'accepted';
end;
$$;
revoke execute on function public.veto_trade(uuid) from public, anon;
grant execute on function public.veto_trade(uuid) to authenticated;

-- Turning Trades off calls off every trade that hasn't taken effect.
create or replace function public.set_trades_enabled(p_league_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_league_commissioner(p_league_id)
          or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)) then
    raise exception 'Only a commissioner can change Trades';
  end if;
  if p_enabled and not exists (
    select 1 from public.scoring_settings where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Trades need Dance Card turned on';
  end if;
  update public.leagues
  set trades_on_since = case when not p_enabled then null when trades_enabled then trades_on_since else now() end,
      trades_enabled = p_enabled
  where id = p_league_id;
  if not p_enabled then
    update public.trade_offers set status = 'cancelled', resolved_at = now()
    where league_id = p_league_id and status in ('proposed', 'accepted');
  end if;
end;
$$;
revoke execute on function public.set_trades_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_trades_enabled(uuid, boolean) to authenticated;

-- Whichever was submitted first holds a couple: a trade can't be proposed for
-- a couple in a pending claim (propose_trade), and a claim can't name one in
-- an open trade.
create or replace function public.trade_holds_claim_couple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.trade_legs g
    join public.trade_offers t on t.id = g.trade_id
    where t.league_id = new.league_id
      and (t.status = 'accepted' or (t.status = 'proposed' and t.expires_at > now()))
      and g.couple_id in (new.couple_id, new.drop_couple_id)
  ) then
    raise exception 'That couple is in a trade that hasn''t been settled, so they can''t be in a waiver claim';
  end if;
  return new;
end;
$$;
drop trigger if exists trade_holds_claim_couple on public.waiver_claims;
create trigger trade_holds_claim_couple
before insert on public.waiver_claims
for each row when (new.status = 'pending')
execute function public.trade_holds_claim_couple();

-- Carries out every trade whose veto window has closed, oldest acceptance
-- first. A trade that no longer works as agreed fails whole.
create or replace function public.run_league_trades(p_league_id uuid, p_week_number int, p_start_week int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trade_offers;
  v_problem text;
  v_week public.competition_weeks;
  v_moves jsonb;
  v_move record;
  v_done int := 0;
begin
  for v_trade in
    select * from public.trade_offers
    where league_id = p_league_id and status = 'accepted' and veto_ends_at <= now()
    order by accepted_at, id
  loop
    v_problem := public.trade_problem(v_trade.id, true);
    v_week := null;
    if v_problem is null and exists (
      select 1 from public.trade_legs where trade_id = v_trade.id and points is not null
    ) then
      -- Points land on a week the league already has totals for.
      v_week := public.latest_scored_week(p_league_id);
      if v_week.id is null or exists (
        select 1 from public.trade_legs g, unnest(array[g.from_manager_id, g.to_manager_id]) as party(manager_id)
        where g.trade_id = v_trade.id and g.points is not null and not exists (
          select 1 from public.weekly_manager_scores s
          where s.league_id = p_league_id and s.manager_id = party.manager_id and s.week_id = v_week.id
        )
      ) then
        v_problem := 'no_scored_week';
      end if;
    end if;
    if v_problem is not null then
      update public.trade_offers
      set status = 'failed', result = v_problem, resolved_at = now(), week_number = p_week_number
      where id = v_trade.id;
      continue;
    end if;

    -- Worked out before any spot changes hands.
    select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) into v_moves from public.trade_moves(v_trade.id) m;

    -- A couple keeps every week before the start week with the manager who
    -- had it. A row that hadn't started yet never scored, so it leaves no history.
    delete from public.roster_slots rs
    using public.trade_legs g
    where g.trade_id = v_trade.id and g.couple_id = rs.couple_id and rs.manager_id = g.from_manager_id
      and rs.league_id = p_league_id and rs.end_week is null and rs.start_week >= p_start_week;
    update public.roster_slots rs set end_week = p_start_week - 1
    from public.trade_legs g
    where g.trade_id = v_trade.id and g.couple_id = rs.couple_id and rs.manager_id = g.from_manager_id
      and rs.league_id = p_league_id and rs.end_week is null;

    for v_move in
      select * from jsonb_to_recordset(v_moves) as m(manager_id uuid, couple_id uuid, slot_number int)
    loop
      delete from public.roster_slots
      where league_id = p_league_id and manager_id = v_move.manager_id and slot_number = v_move.slot_number
        and end_week is null and start_week >= p_start_week;
      update public.roster_slots set end_week = p_start_week - 1
      where league_id = p_league_id and manager_id = v_move.manager_id and slot_number = v_move.slot_number
        and end_week is null;
      insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
      values (p_league_id, v_move.manager_id, v_move.slot_number, v_move.couple_id, 'trade', p_start_week);

      -- As with a waiver award: the spot is alive from the start week and
      -- the manager holds the couple, so neither can carry a Lifeline.
      delete from public.lifeline_picks lp
      using public.competition_weeks w
      where w.id = lp.week_id and w.week_number >= p_start_week
        and lp.league_id = p_league_id and lp.manager_id = v_move.manager_id
        and (lp.slot_number = v_move.slot_number or lp.couple_id = v_move.couple_id);
    end loop;

    insert into public.league_point_adjustments (league_id, manager_id, week_id, kind, points, weighted_points, source_id, detail)
    select p_league_id, x.manager_id, v_week.id, 'trade_transfer', x.points, x.points, v_trade.id,
           jsonb_build_object('with', x.other_manager_id)
    from (
      select g.from_manager_id as manager_id, -g.points as points, g.to_manager_id as other_manager_id
      from public.trade_legs g where g.trade_id = v_trade.id and g.points is not null
      union all
      select g.to_manager_id, g.points, g.from_manager_id
      from public.trade_legs g where g.trade_id = v_trade.id and g.points is not null
    ) x;

    update public.trade_offers
    set status = 'executed', resolved_at = now(), week_number = p_week_number, start_week = p_start_week
    where id = v_trade.id;
    v_done := v_done + 1;
  end loop;

  update public.trade_offers set status = 'expired', resolved_at = now()
  where league_id = p_league_id and status = 'proposed'
    and now() >= least(expires_at, coalesce(public.trade_deadline(p_league_id), now()));
  return v_done;
end;
$$;
revoke all on function public.run_league_trades(uuid, int, int) from public, anon, authenticated;

-- One league's run for one week, at most once: trades first, then claims in
-- the reverse standings order from before any trade's points moved.
create or replace function public.process_league_recast(p_league_id uuid, p_week_id uuid, p_week_number int, p_start_week int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid[];
  v_trades int;
  v_awards int;
begin
  perform 1 from public.leagues where id = p_league_id for update;
  if exists (select 1 from public.recast_cycles where league_id = p_league_id and week_id = p_week_id) then
    return 0;
  end if;
  select array_agg(o.manager_id order by o.list_position) into v_order from public.recast_order(p_league_id) o;
  v_trades := public.run_league_trades(p_league_id, p_week_number, p_start_week);
  v_awards := public.run_recast_claims(p_league_id, p_week_number, p_start_week, v_order);
  insert into public.recast_cycles (league_id, week_id, week_number, start_week, awards, trades)
  values (p_league_id, p_week_id, p_week_number, p_start_week, v_awards, v_trades);
  return v_awards;
end;
$$;
