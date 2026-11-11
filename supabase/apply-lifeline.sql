-- Lifeline (Kylie, 2026-11-10): a manager with a dead roster slot (its couple
-- eliminated or withdrawn, not refilled by Recast) picks a living couple they
-- don't own each week; if that couple survives, the manager gets half its
-- Dance Card credit for the week, weighted like Dance Card. The couple stays
-- on its owner's roster. A commissioner turns it on (default off) and may add
-- the Equalizer: one adjustment per manager for the dead slot-weeks before
-- Lifeline existed, shown in full before it is confirmed.
--
-- Apply after apply-dance-card-v3.sql and before deploying the app that reads
-- weekly_manager_standings. The current app keeps working against this file
-- while no league has Lifeline on.
--
-- What changes:
--   1. leagues.lifeline_enabled / lifeline_starts_week.
--   2. lifeline_picks (one per dead slot per week), lifeline_payouts (written
--      at publication from the app's plan) and league_point_adjustments (the
--      Equalizer; trade transfers later).
--   3. weekly_manager_standings: weekly_manager_scores plus Lifeline and
--      adjustments. Every reader that shows or ranks totals reads it; the
--      writers and --verify keep using the table, whose totals are unchanged.
--   4. commit_episode_publication_with_later_weeks also settles Lifeline,
--      refusing a plan without payouts while any league plays it.
--   5. A league with Lifeline points can't switch Dance Card version.

alter table public.leagues
  add column if not exists lifeline_enabled boolean not null default false,
  add column if not exists lifeline_starts_week int;

create table if not exists public.lifeline_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  week_id uuid not null references public.competition_weeks(id),
  slot_number int not null,
  couple_id uuid not null references public.couples(id),
  picked_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (league_id, manager_id, week_id, slot_number),
  unique (league_id, manager_id, week_id, couple_id)
);

create table if not exists public.lifeline_payouts (
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  week_id uuid not null references public.competition_weeks(id),
  slot_number int not null,
  couple_id uuid not null references public.couples(id),
  credit numeric not null,
  survived boolean not null,
  points numeric not null check (points >= 0),
  weighted_points numeric not null check (weighted_points >= 0),
  computed_at timestamptz not null default now(),
  primary key (league_id, manager_id, week_id, slot_number)
);

create table if not exists public.league_point_adjustments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  week_id uuid not null references public.competition_weeks(id),
  kind text not null check (kind in ('lifeline_equalizer', 'trade_transfer')),
  -- Raw points for the Equalizer (weighted like Dance Card into
  -- weighted_points); for a transfer both are the same total-points amount.
  points numeric not null,
  weighted_points numeric not null,
  source_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists league_point_adjustments_one_equalizer
  on public.league_point_adjustments(league_id, manager_id) where kind = 'lifeline_equalizer';

alter table public.lifeline_picks enable row level security;
alter table public.lifeline_payouts enable row level security;
alter table public.league_point_adjustments enable row level security;

create or replace function public.lifeline_lock_at(p_league_id uuid, p_week_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when coalesce((select eliminations_category_enabled from public.scoring_settings where league_id = p_league_id), true)
      then public.prediction_lock_at(p_league_id, p_week_id)
    else (select min(airs_at) from public.episodes where week_id = p_week_id)
  end;
$$;
revoke execute on function public.lifeline_lock_at(uuid, uuid) from public;
grant execute on function public.lifeline_lock_at(uuid, uuid) to authenticated, service_role;

drop policy if exists "lifeline picks visible to owner pre-lock, league post-lock" on public.lifeline_picks;
create policy "lifeline picks visible to owner pre-lock, league post-lock"
on public.lifeline_picks for select
using (
  public.is_league_member(league_id)
  and (
    exists (
      select 1 from public.league_members
      where league_id = lifeline_picks.league_id
        and user_id = lifeline_picks.manager_id
        and (user_id = auth.uid() or co_manager_id = auth.uid())
    )
    or now() >= public.lifeline_lock_at(league_id, week_id)
  )
);
drop policy if exists "lifeline payouts are viewable by league members" on public.lifeline_payouts;
create policy "lifeline payouts are viewable by league members"
on public.lifeline_payouts for select using (public.is_league_member(league_id));
drop policy if exists "point adjustments are viewable by league members" on public.league_point_adjustments;
create policy "point adjustments are viewable by league members"
on public.league_point_adjustments for select using (public.is_league_member(league_id));

revoke all on public.lifeline_picks, public.lifeline_payouts, public.league_point_adjustments from anon, authenticated;
grant select on public.lifeline_picks, public.lifeline_payouts, public.league_point_adjustments to authenticated;
grant select, insert, update, delete on public.lifeline_picks, public.lifeline_payouts, public.league_point_adjustments to service_role;

-- security_invoker so each table's own policy decides what a viewer sums.
-- lifeline_points and transfer_points are already in total-points units.
create or replace view public.weekly_manager_standings with (security_invoker = true) as
select
  s.league_id,
  s.manager_id,
  s.week_id,
  s.roster_points,
  s.prediction_points,
  s.grand_finale_points,
  coalesce(l.points, 0) + coalesce(a.lifeline, 0) as lifeline_points,
  coalesce(a.transfers, 0) as transfer_points,
  s.total_points + coalesce(l.points, 0) + coalesce(a.lifeline, 0) + coalesce(a.transfers, 0) as total_points
from public.weekly_manager_scores s
left join lateral (
  select sum(p.weighted_points) as points
  from public.lifeline_payouts p
  where p.league_id = s.league_id and p.manager_id = s.manager_id and p.week_id = s.week_id
) l on true
left join lateral (
  select sum(a.weighted_points) filter (where a.kind = 'lifeline_equalizer') as lifeline,
         sum(a.weighted_points) filter (where a.kind = 'trade_transfer') as transfers
  from public.league_point_adjustments a
  where a.league_id = s.league_id and a.manager_id = s.manager_id and a.week_id = s.week_id
) a on true;
grant select on public.weekly_manager_standings to authenticated, service_role;

-- A slot is dead for a week when the couple holding it that week went home
-- in an earlier week.
create or replace function public.lifeline_slot_is_dead(p_league_id uuid, p_manager_id uuid, p_slot_number int, p_week_number int)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.roster_slots rs
    join public.couples c on c.id = rs.couple_id
    where rs.league_id = p_league_id and rs.manager_id = p_manager_id and rs.slot_number = p_slot_number
      and rs.start_week <= p_week_number and (rs.end_week is null or rs.end_week >= p_week_number)
      and c.status in ('eliminated', 'withdrawn') and c.elimination_week < p_week_number
  );
$$;
revoke execute on function public.lifeline_slot_is_dead(uuid, uuid, int, int) from public, anon, authenticated;

create or replace function public.set_lifeline_pick(p_league_id uuid, p_week_id uuid, p_slot_number int, p_couple_id uuid)
returns public.lifeline_picks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.resolve_acting_league_member(p_league_id);
  v_league public.leagues;
  v_week public.competition_weeks;
  v_pick public.lifeline_picks;
begin
  if v_team is null then raise exception 'You are not in this league'; end if;
  select * into v_league from public.leagues where id = p_league_id;
  if not v_league.lifeline_enabled then raise exception 'Lifeline is off in this league'; end if;
  select * into v_week from public.competition_weeks where id = p_week_id and season_id = public.active_season_id();
  if not found then raise exception 'That week is not in this season'; end if;
  if v_week.week_number < coalesce(v_league.lifeline_starts_week, 2147483647) then
    raise exception 'Lifeline starts in Week %', v_league.lifeline_starts_week;
  end if;
  if exists (
    select 1 from public.episodes e join public.competition_weeks w on w.id = e.week_id
    where w.season_id = v_week.season_id and w.week_number < v_week.week_number and e.results_published_at is null
  ) then
    raise exception 'Lifeline opens once last week''s results are in';
  end if;
  if now() >= public.lifeline_lock_at(p_league_id, p_week_id) then raise exception 'Lifeline is locked for this week'; end if;
  if not public.lifeline_slot_is_dead(p_league_id, v_team, p_slot_number, v_week.week_number) then
    raise exception 'That roster spot still has a couple dancing';
  end if;
  if not exists (
    select 1 from public.couples where id = p_couple_id and season_id = v_week.season_id and status = 'active'
  ) then
    raise exception 'That couple is no longer dancing';
  end if;
  if exists (
    select 1 from public.roster_slots
    where league_id = p_league_id and manager_id = v_team and couple_id = p_couple_id
      and start_week <= v_week.week_number and (end_week is null or end_week >= v_week.week_number)
  ) then
    raise exception 'Pick a couple you don''t already have';
  end if;
  if exists (
    select 1 from public.lifeline_picks
    where league_id = p_league_id and manager_id = v_team and week_id = p_week_id
      and couple_id = p_couple_id and slot_number <> p_slot_number
  ) then
    raise exception 'Your other Lifeline already has that couple';
  end if;

  insert into public.lifeline_picks (league_id, manager_id, week_id, slot_number, couple_id, picked_by)
  values (p_league_id, v_team, p_week_id, p_slot_number, p_couple_id, auth.uid())
  on conflict (league_id, manager_id, week_id, slot_number)
  do update set couple_id = excluded.couple_id, picked_by = excluded.picked_by, updated_at = now()
  returning * into v_pick;
  return v_pick;
end;
$$;
revoke execute on function public.set_lifeline_pick(uuid, uuid, int, uuid) from public, anon;
grant execute on function public.set_lifeline_pick(uuid, uuid, int, uuid) to authenticated;

create or replace function public.clear_lifeline_pick(p_league_id uuid, p_week_id uuid, p_slot_number int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.resolve_acting_league_member(p_league_id);
begin
  if v_team is null then raise exception 'You are not in this league'; end if;
  if now() >= public.lifeline_lock_at(p_league_id, p_week_id) then raise exception 'Lifeline is locked for this week'; end if;
  delete from public.lifeline_picks
  where league_id = p_league_id and manager_id = v_team and week_id = p_week_id and slot_number = p_slot_number;
end;
$$;
revoke execute on function public.clear_lifeline_pick(uuid, uuid, int) from public, anon;
grant execute on function public.clear_lifeline_pick(uuid, uuid, int) to authenticated;

-- What publication needs beyond its snapshot: every pick of the season and
-- every Equalizer, read under the same transaction's locks by the commit.
create or replace function public.lifeline_publication_inputs()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'picks', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
              from public.lifeline_picks p join public.competition_weeks w on w.id = p.week_id
              where w.season_id = public.active_season_id()),
    'equalizers', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
                   from public.league_point_adjustments a join public.competition_weeks w on w.id = a.week_id
                   where a.kind = 'lifeline_equalizer' and w.season_id = public.active_season_id())
  );
$$;
revoke all on function public.lifeline_publication_inputs() from public, anon, authenticated;
grant execute on function public.lifeline_publication_inputs() to service_role;

-- Replaces this week's and every later scored week's payouts with the plan's,
-- one per pick, and every Equalizer's amount (a correction moves the credits
-- they average). Nothing to do while no league has ever played Lifeline.
create or replace function public.apply_lifeline_settlement(p_episode_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_week public.competition_weeks;
  v_rows jsonb := p_plan->'lifelinePayouts';
  v_equalizers jsonb := p_plan->'lifelineEqualizers';
  v_covered uuid[];
  v_given int;
  v_matched int;
  v_expected int;
begin
  if not exists (select 1 from public.leagues where lifeline_enabled)
     and not exists (select 1 from public.lifeline_picks)
     and not exists (select 1 from public.league_point_adjustments where kind = 'lifeline_equalizer') then
    return;
  end if;
  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_typeof(v_equalizers) is distinct from 'array' then
    raise exception 'A league plays Lifeline, which this version of the app cannot score. Reload the page and try again.';
  end if;
  select w.* into v_week from public.episodes e join public.competition_weeks w on w.id = e.week_id where e.id = p_episode_id;
  if v_week.id is null then return; end if;
  lock table public.lifeline_picks, public.lifeline_payouts, public.league_point_adjustments in share row exclusive mode;

  select coalesce(array_agg(w.id), '{}') into v_covered from public.competition_weeks w
  where w.season_id = v_week.season_id and w.week_number >= v_week.week_number
    and (w.id = v_week.id or exists (select 1 from public.weekly_manager_scores s where s.week_id = w.id));

  select count(*), count(*) filter (where p.id is not null and r.points >= 0 and r.weighted_points >= 0
                                     and r.points = round(r.points, 2) and r.weighted_points = round(r.weighted_points, 2)
                                     and r.credit = round(r.credit, 2))
    into v_given, v_matched
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, slot_number int, couple_id uuid,
                                       credit numeric, survived boolean, points numeric, weighted_points numeric)
  left join public.lifeline_picks p
    on p.league_id = r.league_id and p.manager_id = r.manager_id and p.week_id = r.week_id
   and p.slot_number = r.slot_number and p.couple_id = r.couple_id
   and p.week_id = any(v_covered);
  select count(*) into v_expected from public.lifeline_picks where week_id = any(v_covered);
  if v_given <> v_matched or v_given <> v_expected then
    raise exception 'Lifeline picks changed (% of % settled). Refresh and try again.', v_matched, v_expected;
  end if;

  delete from public.lifeline_payouts where week_id = any(v_covered);
  insert into public.lifeline_payouts (league_id, manager_id, week_id, slot_number, couple_id, credit, survived, points, weighted_points)
  select league_id, manager_id, week_id, slot_number, couple_id, credit, survived, points, weighted_points
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, slot_number int, couple_id uuid,
                                       credit numeric, survived boolean, points numeric, weighted_points numeric);

  select count(*), count(a.id) into v_given, v_matched
  from jsonb_to_recordset(v_equalizers) as r(id uuid, points numeric, weighted_points numeric, detail jsonb)
  left join public.league_point_adjustments a on a.id = r.id and a.kind = 'lifeline_equalizer'
    and r.points >= 0 and r.weighted_points >= 0
    and r.points = round(r.points, 2) and r.weighted_points = round(r.weighted_points, 2);
  select count(*) into v_expected from public.league_point_adjustments a
  join public.competition_weeks w on w.id = a.week_id
  where a.kind = 'lifeline_equalizer' and w.season_id = v_week.season_id;
  if v_given <> v_matched or v_given <> v_expected then
    raise exception 'The Lifeline Equalizer changed. Refresh and try again.';
  end if;
  update public.league_point_adjustments a
  set points = r.points, weighted_points = r.weighted_points, detail = coalesce(r.detail, a.detail)
  from jsonb_to_recordset(v_equalizers) as r(id uuid, points numeric, weighted_points numeric, detail jsonb)
  where a.id = r.id;
end;
$$;
revoke all on function public.apply_lifeline_settlement(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_lifeline_settlement(uuid, jsonb) to service_role;

create or replace function public.commit_episode_publication_with_later_weeks(
  p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb
)
returns void language plpgsql set search_path = '' set lock_timeout = '5s'
as $$
begin
  perform public.commit_episode_publication(p_episode_id, p_published_by, p_snapshot, p_plan);
  perform public.apply_later_dance_card(p_episode_id, p_plan);
  perform public.apply_lifeline_settlement(p_episode_id, p_plan);
end;
$$;
revoke all on function public.commit_episode_publication_with_later_weeks(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_episode_publication_with_later_weeks(uuid, uuid, jsonb, jsonb) to service_role;

-- The latest week whose every night is published and which this league has
-- scores for: where a confirmed adjustment lands, so standings move at once.
create or replace function public.latest_scored_week(p_league_id uuid)
returns public.competition_weeks
language sql
stable
set search_path = ''
as $$
  select w.* from public.competition_weeks w
  where w.season_id = public.active_season_id()
    and exists (select 1 from public.weekly_manager_scores s where s.week_id = w.id and s.league_id = p_league_id)
    and not exists (select 1 from public.episodes e where e.week_id = w.id and e.results_published_at is null)
  order by w.week_number desc
  limit 1;
$$;
revoke all on function public.latest_scored_week(uuid) from public, anon, authenticated;
grant execute on function public.latest_scored_week(uuid) to service_role;

-- The first week a manager could still pick for: where Lifeline starts when
-- it is turned on now, and so the week the Equalizer stops before.
create or replace function public.lifeline_first_open_week(p_league_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select min(w.week_number) from public.competition_weeks w
  where w.season_id = public.active_season_id() and public.lifeline_lock_at(p_league_id, w.id) > now();
$$;
revoke all on function public.lifeline_first_open_week(uuid) from public, anon, authenticated;
grant execute on function public.lifeline_first_open_week(uuid) to service_role;

-- Service only: the app computes the Equalizer from the ledger, shows it to
-- the commissioner, then calls this with the actor and the same numbers.
-- p_starts_week must match the first week still open for picks, which is
-- also the week the Equalizer was computed up to.
create or replace function public.enable_lifeline(p_league_id uuid, p_actor_id uuid, p_starts_week int, p_equalizer jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_league public.leagues;
  v_week public.competition_weeks;
  v_starts int;
begin
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'League not found'; end if;
  if not (
    exists (select 1 from public.league_members where league_id = p_league_id and role = 'commissioner'
              and (user_id = p_actor_id or co_manager_id = p_actor_id))
    or exists (select 1 from public.profiles where id = p_actor_id and is_super_admin)
  ) then
    raise exception 'Only a commissioner can turn on Lifeline';
  end if;
  if v_league.lifeline_enabled then raise exception 'Lifeline is already on'; end if;
  if not exists (select 1 from public.scoring_settings where league_id = p_league_id and dance_card_version in ('v2', 'v3')) then
    raise exception 'Lifeline needs Dance Card scored week by week (v2 or v3)';
  end if;
  v_starts := public.lifeline_first_open_week(p_league_id);
  if v_starts is null then raise exception 'No week is left to play Lifeline'; end if;
  if v_starts is distinct from p_starts_week then
    raise exception 'The numbers changed. Review Lifeline again.';
  end if;
  -- The Equalizer covers every week before the first one played, so each of
  -- those must be settled before its numbers are shown and confirmed.
  if exists (
    select 1 from public.episodes e join public.competition_weeks w on w.id = e.week_id
    where w.season_id = public.active_season_id() and w.week_number < v_starts and e.results_published_at is null
  ) then
    raise exception 'Lifeline can be turned on once this week''s results are in';
  end if;

  if jsonb_typeof(p_equalizer) = 'array' and jsonb_array_length(p_equalizer) > 0 then
    v_week := public.latest_scored_week(p_league_id);
    if v_week.id is null then raise exception 'No published week to add the Equalizer to'; end if;
    if exists (
      select 1 from jsonb_to_recordset(p_equalizer) as r(manager_id uuid, points numeric, weighted_points numeric, detail jsonb)
      where r.points is null or r.points <= 0 or r.weighted_points is null or r.weighted_points < 0
         or r.points <> round(r.points, 2) or r.weighted_points <> round(r.weighted_points, 2)
         or not exists (select 1 from public.weekly_manager_scores s
                        where s.league_id = p_league_id and s.manager_id = r.manager_id and s.week_id = v_week.id)
    ) or (select count(*) <> count(distinct r.manager_id) from jsonb_to_recordset(p_equalizer) as r(manager_id uuid)) then
      raise exception 'Invalid Equalizer';
    end if;
    insert into public.league_point_adjustments (league_id, manager_id, week_id, kind, points, weighted_points, detail, created_by)
    select p_league_id, r.manager_id, v_week.id, 'lifeline_equalizer', r.points, r.weighted_points, coalesce(r.detail, '{}'::jsonb), p_actor_id
    from jsonb_to_recordset(p_equalizer) as r(manager_id uuid, points numeric, weighted_points numeric, detail jsonb);
  end if;

  update public.leagues set lifeline_enabled = true, lifeline_starts_week = v_starts where id = p_league_id;
end;
$$;
revoke all on function public.enable_lifeline(uuid, uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.enable_lifeline(uuid, uuid, int, jsonb) to service_role;

create or replace function public.disable_lifeline(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_league_commissioner(p_league_id)
          or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)) then
    raise exception 'Only a commissioner can turn off Lifeline';
  end if;
  if exists (select 1 from public.lifeline_picks where league_id = p_league_id)
     or exists (select 1 from public.league_point_adjustments where league_id = p_league_id and kind = 'lifeline_equalizer') then
    raise exception 'Lifeline can''t be turned off once it has picks or an Equalizer';
  end if;
  update public.leagues set lifeline_enabled = false, lifeline_starts_week = null where id = p_league_id;
end;
$$;
revoke execute on function public.disable_lifeline(uuid) from public, anon;
grant execute on function public.disable_lifeline(uuid) to authenticated;

-- Payouts and the Equalizer are built from this league's Dance Card credits;
-- a version switch would leave them stale.
create or replace function public.guard_lifeline_dance_card_version()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.dance_card_version is distinct from old.dance_card_version
     and (exists (select 1 from public.lifeline_payouts where league_id = new.league_id)
          or exists (select 1 from public.league_point_adjustments where league_id = new.league_id and kind = 'lifeline_equalizer')) then
    raise exception 'This league has Lifeline points built on its Dance Card, so its Dance Card version can''t change.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_lifeline_dance_card_version on public.scoring_settings;
create trigger guard_lifeline_dance_card_version
before update of dance_card_version on public.scoring_settings
for each row execute function public.guard_lifeline_dance_card_version();
