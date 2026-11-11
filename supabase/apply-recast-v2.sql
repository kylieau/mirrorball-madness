-- Recast v2 (Kylie, 2026-11-10): Mirrorball's waiver wire, rebuilt. A manager
-- keeps a ranked list of claims; each claim fills an open roster spot or is
-- paired with a drop of a couple still dancing, and the drop only happens if
-- that claim wins. A database job decides every league's list 48 hours after
-- a week's last night, in reverse standings order, with no commissioner step.
--
-- Apply after apply-lifeline.sql and before deploying the app that uses the
-- ranked list. The old Recast page can't submit a claim against this file
-- (its RPCs are dropped), so apply it right before that deploy.
--
-- What changes:
--   1. waiver_claims carries the drop, the list rank, the result and the
--      start week. Other managers' pending claims stop being readable; a
--      pending drop is public through recast_pending_drops.
--   2. recast_cycles stamps one processed run per league per week.
--   3. A league with Recast on always uses reverse standings; turning Recast
--      off clears pending lists. leagues.recast_on_since records when it was
--      turned on, and a week that came due before then never gets a run.
--   4. save_recast_list replaces a manager's list. process_due_recasts
--      (service only, for pg_cron) decides due cycles.
--   5. The first-come, manual and commissioner-processed paths are dropped.
--   6. A couple can hold one current roster spot per league.

alter table public.waiver_claims
  add column if not exists drop_couple_id uuid references public.couples(id),
  add column if not exists start_week int,
  add column if not exists result text
    check (result in ('awarded', 'taken', 'slot_filled', 'slot_changed', 'drop_locked', 'not_dancing')),
  add column if not exists submitted_by uuid references public.profiles(id);

-- A claim left pending by the old methods becomes the start of its manager's
-- list, oldest first; a repeat of the same couple for the same spot is moot.
-- Only the first apply does this: once the rank index exists the lists are
-- ranked ones, and renumbering them by age would reorder them.
do $$
begin
  if to_regclass('public.waiver_claims_pending_rank') is null then
    update public.waiver_claims c
    set status = 'rejected', result = 'slot_filled', resolved_at = now()
    from public.waiver_claims earlier
    where c.status = 'pending' and earlier.status = 'pending'
      and earlier.league_id = c.league_id and earlier.manager_id = c.manager_id
      and earlier.couple_id = c.couple_id and earlier.slot_number = c.slot_number
      and (earlier.created_at, earlier.id) < (c.created_at, c.id);

    update public.waiver_claims c
    set priority_order = ranked.list_rank
    from (
      select id, row_number() over (partition by league_id, manager_id order by created_at, id) as list_rank
      from public.waiver_claims where status = 'pending'
    ) ranked
    where ranked.id = c.id;
  end if;
end $$;

create unique index if not exists waiver_claims_pending_rank
  on public.waiver_claims(league_id, manager_id, priority_order) where status = 'pending';
create unique index if not exists waiver_claims_pending_once
  on public.waiver_claims(league_id, manager_id, couple_id, slot_number) where status = 'pending';
create unique index if not exists roster_slots_one_current_holder
  on public.roster_slots(league_id, couple_id) where end_week is null;

create table if not exists public.recast_cycles (
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_id uuid not null references public.competition_weeks(id),
  week_number int not null,
  start_week int not null,
  awards int not null default 0,
  processed_at timestamptz not null default now(),
  primary key (league_id, week_id)
);
alter table public.recast_cycles enable row level security;
drop policy if exists "recast cycles are viewable by league members" on public.recast_cycles;
create policy "recast cycles are viewable by league members"
on public.recast_cycles for select
using (public.is_league_member(league_id));
revoke all on public.recast_cycles from anon, authenticated;
grant select on public.recast_cycles to authenticated;
grant select, insert, update, delete on public.recast_cycles to service_role;

-- Claims are blind until the run: a manager reads their own list and results,
-- and the league reads the awards (the public add/drop log).
drop policy if exists "waiver claims are viewable by league members" on public.waiver_claims;
drop policy if exists "recast claims: own list, and the league's awards" on public.waiver_claims;
create policy "recast claims: own list, and the league's awards"
on public.waiver_claims for select
using (
  public.is_league_member(league_id)
  and (status = 'approved' or manager_id = public.resolve_acting_league_member(league_id))
);

-- A couple someone will drop if their claim wins: on the wire as pending.
create or replace function public.recast_pending_drops(p_league_id uuid)
returns table (couple_id uuid, manager_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.drop_couple_id, c.manager_id
  from public.waiver_claims c
  where c.league_id = p_league_id and c.status = 'pending' and c.drop_couple_id is not null
    and public.is_league_member(p_league_id);
$$;
revoke execute on function public.recast_pending_drops(uuid) from public, anon;
grant execute on function public.recast_pending_drops(uuid) to authenticated;

-- A run only decides a week that came due while Recast was on, so turning it
-- on never sets off an immediate run for the week before.
alter table public.leagues add column if not exists recast_on_since timestamptz;

create or replace function public.recast_mode_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.waiver_claim_method := case when new.waiver_mode = 'waivers' then 'reverse_standings' end;
  if new.waiver_mode = 'waivers' and (tg_op = 'INSERT' or old.waiver_mode <> 'waivers') then
    new.recast_on_since := now();
  end if;
  if tg_op = 'UPDATE' and old.waiver_mode = 'waivers' and new.waiver_mode <> 'waivers' then
    delete from public.waiver_claims where league_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists recast_mode_rules on public.leagues;
create trigger recast_mode_rules
before insert or update of waiver_mode, waiver_claim_method on public.leagues
for each row execute function public.recast_mode_rules();

update public.leagues set waiver_claim_method = 'reverse_standings', recast_on_since = now()
where waiver_mode = 'waivers' and recast_on_since is null;

-- When this league's runs began. Trades redefine it, since a league can run
-- trades without Recast.
create or replace function public.recast_runs_since(p_league_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select recast_on_since from public.leagues where id = p_league_id and waiver_mode = 'waivers';
$$;
revoke all on function public.recast_runs_since(uuid) from public, anon, authenticated;
grant execute on function public.recast_runs_since(uuid) to service_role;

-- The league's next run: the latest week whose last night aired 48 hours ago
-- if it hasn't been processed, else the week after. Earlier unprocessed weeks
-- are skipped, as is any week that came due before Recast was turned on, and
-- the season's last week never has a run. start_week is the first week that
-- won't have aired at all when the run happens.
create or replace function public.recast_next_cycle(p_league_id uuid)
returns table (week_id uuid, week_number int, due_at timestamptz, results_in boolean, start_week int)
language sql
stable
security definer
set search_path = ''
as $$
  with weeks as (
    select w.id, w.week_number, w.is_finale,
           min(e.airs_at) as first_airs_at,
           max(e.airs_at) + interval '48 hours' as due_at,
           bool_and(e.results_published_at is not null) as results_in
    from public.competition_weeks w
    join public.episodes e on e.week_id = w.id
    where w.season_id = public.active_season_id()
    group by w.id
  )
  select c.id, c.week_number, c.due_at, c.results_in,
         (select min(n.week_number) from weeks n
          where n.week_number > c.week_number and n.first_airs_at > greatest(c.due_at, now()))
  from weeks c
  where c.week_number >= coalesce((select max(d.week_number) from weeks d where d.due_at <= now()), 0)
    and c.week_number < coalesce(
      (select min(f.week_number) from weeks f where f.is_finale),
      (select max(l.week_number) from weeks l)
    )
    and c.due_at > public.recast_runs_since(p_league_id)
    and not exists (
      select 1 from public.recast_cycles rc where rc.league_id = p_league_id and rc.week_id = c.id
    )
  order by c.week_number
  limit 1;
$$;
revoke execute on function public.recast_next_cycle(uuid) from public, anon;
grant execute on function public.recast_next_cycle(uuid) to authenticated, service_role;

-- Reverse standings: lowest season total first, then the lower most recent
-- week, then whoever picked later in the draft's first round.
create or replace function public.recast_order(p_league_id uuid)
returns table (manager_id uuid, list_position int, season_total numeric, last_week_total numeric)
language sql
stable
set search_path = ''
as $$
  with weeks as (
    select id, week_number from public.competition_weeks where season_id = public.active_season_id()
  ), last_week as (
    select w.id from weeks w
    where exists (select 1 from public.weekly_manager_scores s where s.league_id = p_league_id and s.week_id = w.id)
    order by w.week_number desc
    limit 1
  ), totals as (
    select s.manager_id,
           sum(s.total_points) as season_total,
           sum(s.total_points) filter (where s.week_id = (select id from last_week)) as last_week_total
    from public.weekly_manager_standings s
    join weeks w on w.id = s.week_id
    where s.league_id = p_league_id
    group by s.manager_id
  )
  select m.user_id,
         row_number() over (
           order by coalesce(t.season_total, 0), coalesce(t.last_week_total, 0),
                    case when l.draft_type = 'custom' then array_position(l.custom_pick_order, m.user_id) else m.draft_position end
                      desc nulls last,
                    m.user_id
         )::int,
         coalesce(t.season_total, 0),
         coalesce(t.last_week_total, 0)
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  left join totals t on t.manager_id = m.user_id
  where m.league_id = p_league_id;
$$;
revoke all on function public.recast_order(uuid) from public, anon, authenticated;
grant execute on function public.recast_order(uuid) to service_role;

-- Whether a manager dropped this couple in the given run or the one before
-- it: they can't claim it back in either.
create or replace function public.recast_drop_locked(p_league_id uuid, p_manager_id uuid, p_couple_id uuid, p_cycle_weeks int[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.waiver_claims
    where league_id = p_league_id and manager_id = p_manager_id and status = 'approved'
      and drop_couple_id = p_couple_id and week_number = any (p_cycle_weeks)
  );
$$;
revoke all on function public.recast_drop_locked(uuid, uuid, uuid, int[]) from public, anon, authenticated;

create or replace function public.save_recast_list(p_league_id uuid, p_claims jsonb)
returns setof public.waiver_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.resolve_acting_league_member(p_league_id);
  v_league public.leagues;
  v_cycle record;
  v_last_cycle int;
  v_item record;
  v_slot record;
  v_holder uuid;
begin
  if v_team is null then raise exception 'You are not a member of this league'; end if;
  -- Serializes with the run, which holds the same lock while it decides.
  select * into v_league from public.leagues where id = p_league_id for update;
  if not exists (
    select 1 from public.scoring_settings where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;
  if v_league.waiver_mode <> 'waivers' then raise exception 'This league does not use Recast'; end if;
  if jsonb_typeof(p_claims) is distinct from 'array' then raise exception 'A waiver list is required'; end if;
  if jsonb_array_length(p_claims) > 20 then raise exception 'A waiver list holds up to 20 claims'; end if;

  select * into v_cycle from public.recast_next_cycle(p_league_id);
  if v_cycle.week_number is null and jsonb_array_length(p_claims) > 0 then
    raise exception 'There are no more waiver runs this season';
  end if;
  -- Trades can keep a run alive that came due before Recast was turned on
  -- (apply-trades.sql); claims wait for the run after it.
  if v_cycle.due_at <= v_league.recast_on_since and jsonb_array_length(p_claims) > 0 then
    raise exception 'Waiver claims open after the run that is already due';
  end if;
  select max(week_number) into v_last_cycle from public.recast_cycles where league_id = p_league_id;

  if (
    select count(*) <> count(distinct (e.value->>'couple_id', e.value->>'slot_number'))
    from jsonb_array_elements(p_claims) e
  ) then
    raise exception 'That claim is already on your list';
  end if;

  for v_item in
    select (e.value->>'couple_id')::uuid as couple_id,
           (e.value->>'slot_number')::int as slot_number,
           (e.value->>'drop_couple_id')::uuid as drop_couple_id
    from jsonb_array_elements(p_claims) e
  loop
    select rs.couple_id, c.status into v_slot
    from public.roster_slots rs
    join public.couples c on c.id = rs.couple_id
    where rs.league_id = p_league_id and rs.manager_id = v_team
      and rs.slot_number = v_item.slot_number and rs.end_week is null;
    if not found then
      -- A spot with no couple at all (a trade emptied it) is open too.
      if v_item.drop_couple_id is not null or v_item.slot_number not between 1 and v_league.roster_size then
        raise exception 'That roster spot is not yours';
      end if;
    elsif v_item.drop_couple_id is null and v_slot.status not in ('eliminated', 'withdrawn') then
      raise exception 'That roster spot still has a couple dancing. Choose them as the drop.';
    elsif v_item.drop_couple_id is not null and (v_slot.couple_id <> v_item.drop_couple_id or v_slot.status <> 'active') then
      raise exception 'You can only drop a couple on your roster that is still dancing';
    end if;

    if not exists (
      select 1 from public.couples
      where id = v_item.couple_id and status = 'active' and season_id = public.active_season_id()
    ) then
      raise exception 'That couple is no longer dancing';
    end if;
    select manager_id into v_holder from public.roster_slots
    where league_id = p_league_id and couple_id = v_item.couple_id and end_week is null;
    if v_holder = v_team then raise exception 'That couple is already on your roster'; end if;
    if v_holder is not null and not exists (
      select 1 from public.waiver_claims
      where league_id = p_league_id and manager_id = v_holder and status = 'pending'
        and drop_couple_id = v_item.couple_id
    ) then
      raise exception 'That couple is on another roster';
    end if;
    if public.recast_drop_locked(p_league_id, v_team, v_item.couple_id, array[v_last_cycle]) then
      raise exception 'You dropped that couple in the last waiver run, so you can''t claim them in this one';
    end if;
  end loop;

  delete from public.waiver_claims
  where league_id = p_league_id and manager_id = v_team and status = 'pending';

  return query
  insert into public.waiver_claims
    (league_id, couple_id, manager_id, slot_number, week_number, status, priority_order, drop_couple_id, submitted_by)
  select p_league_id, n.couple_id, v_team, n.slot_number, v_cycle.week_number, 'pending', n.list_rank, n.drop_couple_id, auth.uid()
  from (
    select (e.value->>'couple_id')::uuid as couple_id,
           (e.value->>'slot_number')::int as slot_number,
           (e.value->>'drop_couple_id')::uuid as drop_couple_id,
           e.ordinality::int as list_rank
    from jsonb_array_elements(p_claims) with ordinality e
  ) n
  returning *;
end;
$$;
revoke execute on function public.save_recast_list(uuid, jsonb) from public, anon;
grant execute on function public.save_recast_list(uuid, jsonb) to authenticated;

-- Where a pending claim stands right now in a run: 'ready' to award,
-- 'waiting' on its couple's holder (who still has a claim that would drop
-- it), or the reason it can't win.
create or replace function public.recast_claim_state(p_claim public.waiver_claims, p_cycle_weeks int[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_slot record;
  v_holder uuid;
begin
  if not exists (
    select 1 from public.couples
    where id = p_claim.couple_id and status = 'active' and season_id = public.active_season_id()
  ) then
    return 'not_dancing';
  end if;
  if public.recast_drop_locked(p_claim.league_id, p_claim.manager_id, p_claim.couple_id, p_cycle_weeks) then
    return 'drop_locked';
  end if;

  select rs.couple_id, c.status into v_slot
  from public.roster_slots rs
  join public.couples c on c.id = rs.couple_id
  where rs.league_id = p_claim.league_id and rs.manager_id = p_claim.manager_id
    and rs.slot_number = p_claim.slot_number and rs.end_week is null;
  -- A spot with no couple at all is open. A couple named as the drop that has
  -- since gone home leaves an open spot too, which the claim still fills.
  if not found then
    if p_claim.drop_couple_id is not null or p_claim.slot_number not between 1 and
         (select roster_size from public.leagues where id = p_claim.league_id) then
      return 'slot_changed';
    end if;
  elsif (p_claim.drop_couple_id is null and v_slot.status not in ('eliminated', 'withdrawn'))
    or (p_claim.drop_couple_id is not null and v_slot.couple_id <> p_claim.drop_couple_id) then
    return 'slot_changed';
  end if;

  select manager_id into v_holder from public.roster_slots
  where league_id = p_claim.league_id and couple_id = p_claim.couple_id and end_week is null;
  if v_holder is null then return 'ready'; end if;
  if v_holder <> p_claim.manager_id and exists (
    select 1 from public.waiver_claims
    where league_id = p_claim.league_id and manager_id = v_holder and status = 'pending'
      and drop_couple_id = p_claim.couple_id
  ) then
    return 'waiting';
  end if;
  return 'taken';
end;
$$;
revoke all on function public.recast_claim_state(public.waiver_claims, int[]) from public, anon, authenticated;

-- Decides every pending claim in the league. Managers take turns in the
-- order given (frozen before the run changes anything); a turn awards the
-- manager's highest claim that can win, one award each per round, and the
-- rounds repeat while any claim is awarded. A claim for a couple whose holder
-- may still drop it holds its manager's turn until that drop happens or
-- can't: every award sends the turn back to the top of the order, so a
-- manager who was waiting takes the freed couple ahead of anyone after them.
-- When nothing else can move, the first such claim in line loses, which is
-- also how two managers each waiting on the other end.
create or replace function public.run_recast_claims(p_league_id uuid, p_week_number int, p_start_week int, p_order uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle_weeks int[];
  v_manager uuid;
  v_claim public.waiver_claims;
  v_state text;
  v_awards int := 0;
  v_round_awarded uuid[] := '{}';
  v_awarded boolean;
  v_first_waiting uuid;
begin
  select array[p_week_number, max(week_number)] into v_cycle_weeks
  from public.recast_cycles where league_id = p_league_id and week_number < p_week_number;

  loop
    v_awarded := false;
    v_first_waiting := null;
    foreach v_manager in array coalesce(p_order, '{}'::uuid[]) loop
      continue when v_manager = any(v_round_awarded);
      for v_claim in
        select * from public.waiver_claims
        where league_id = p_league_id and manager_id = v_manager and status = 'pending'
        order by priority_order
      loop
        v_state := public.recast_claim_state(v_claim, v_cycle_weeks);
        if v_state = 'waiting' then
          v_first_waiting := coalesce(v_first_waiting, v_claim.id);
          exit;
        end if;
        if v_state <> 'ready' then
          update public.waiver_claims
          set status = 'rejected', result = v_state, resolved_at = now(), week_number = p_week_number
          where id = v_claim.id;
          continue;
        end if;

        -- The outgoing couple keeps every week before the start week. A row
        -- that hadn't started yet never scored, so it leaves no history.
        delete from public.roster_slots
        where league_id = p_league_id and manager_id = v_manager and slot_number = v_claim.slot_number
          and end_week is null and start_week >= p_start_week;
        update public.roster_slots set end_week = p_start_week - 1
        where league_id = p_league_id and manager_id = v_manager and slot_number = v_claim.slot_number
          and end_week is null;
        insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
        values (p_league_id, v_manager, v_claim.slot_number, v_claim.couple_id, 'waiver', p_start_week);

        update public.waiver_claims
        set status = 'approved', result = 'awarded', resolved_at = now(),
            week_number = p_week_number, start_week = p_start_week,
            drop_couple_id = (select c.id from public.couples c where c.id = v_claim.drop_couple_id and c.status = 'active')
        where id = v_claim.id;
        update public.waiver_claims
        set status = 'rejected', result = 'slot_filled', resolved_at = now(), week_number = p_week_number
        where league_id = p_league_id and manager_id = v_manager and slot_number = v_claim.slot_number
          and status = 'pending';

        -- The spot is alive again from the start week, and the manager now
        -- holds the couple, so neither can carry a Lifeline from then on.
        delete from public.lifeline_picks lp
        using public.competition_weeks w
        where w.id = lp.week_id and w.week_number >= p_start_week
          and lp.league_id = p_league_id and lp.manager_id = v_manager
          and (lp.slot_number = v_claim.slot_number or lp.couple_id = v_claim.couple_id);

        v_awards := v_awards + 1;
        v_round_awarded := v_round_awarded || v_manager;
        v_awarded := true;
        exit;
      end loop;
      exit when v_awarded;
    end loop;

    continue when v_awarded;
    if cardinality(v_round_awarded) > 0 then
      v_round_awarded := '{}';
      continue;
    end if;
    exit when v_first_waiting is null;
    update public.waiver_claims
    set status = 'rejected', result = 'taken', resolved_at = now(), week_number = p_week_number
    where id = v_first_waiting;
  end loop;

  update public.waiver_claims
  set status = 'rejected', result = 'taken', resolved_at = now(), week_number = p_week_number
  where league_id = p_league_id and status = 'pending';
  return v_awards;
end;
$$;
revoke all on function public.run_recast_claims(uuid, int, int, uuid[]) from public, anon, authenticated;

-- One league's run for one week, at most once.
create or replace function public.process_league_recast(p_league_id uuid, p_week_id uuid, p_week_number int, p_start_week int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_awards int;
begin
  perform 1 from public.leagues where id = p_league_id for update;
  if exists (select 1 from public.recast_cycles where league_id = p_league_id and week_id = p_week_id) then
    return 0;
  end if;
  v_awards := public.run_recast_claims(
    p_league_id, p_week_number, p_start_week,
    (select array_agg(o.manager_id order by o.list_position) from public.recast_order(p_league_id) o)
  );
  insert into public.recast_cycles (league_id, week_id, week_number, start_week, awards)
  values (p_league_id, p_week_id, p_week_number, p_start_week, v_awards);
  return v_awards;
end;
$$;
revoke all on function public.process_league_recast(uuid, uuid, int, int) from public, anon, authenticated;

-- The scheduled job: every league whose run is due. A week whose
-- results aren't published waits up to 24 more hours, then runs anyway.
-- Safe to call as often as wanted; one league failing doesn't stop the rest.
create or replace function public.process_due_recasts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_cycle record;
  v_runs jsonb := '[]'::jsonb;
begin
  for v_league_id in select id from public.leagues where public.recast_runs_since(id) is not null order by id loop
    select * into v_cycle from public.recast_next_cycle(v_league_id);
    continue when v_cycle.week_number is null or v_cycle.start_week is null or v_cycle.due_at > now();
    continue when not v_cycle.results_in and now() < v_cycle.due_at + interval '24 hours';
    begin
      v_runs := v_runs || jsonb_build_object(
        'league_id', v_league_id, 'week', v_cycle.week_number,
        'awards', public.process_league_recast(v_league_id, v_cycle.week_id, v_cycle.week_number, v_cycle.start_week)
      );
    exception when others then
      raise warning 'Recast run failed for league %: %', v_league_id, sqlerrm;
      v_runs := v_runs || jsonb_build_object('league_id', v_league_id, 'week', v_cycle.week_number, 'error', sqlerrm);
    end;
  end loop;
  return v_runs;
end;
$$;
revoke all on function public.process_due_recasts() from public, anon, authenticated;
grant execute on function public.process_due_recasts() to service_role;

-- For the site admin's notice: runs that are due and haven't happened,
-- either waiting on a week's results or stuck.
create or replace function public.recast_runs_overdue()
returns table (week_number int, due_at timestamptz, results_in boolean, leagues int)
language sql
stable
security definer
set search_path = ''
as $$
  select c.week_number, c.due_at, c.results_in, count(*)::int
  from public.leagues l
  cross join lateral public.recast_next_cycle(l.id) c
  where c.due_at <= now() and c.start_week is not null
  group by c.week_number, c.due_at, c.results_in;
$$;
revoke all on function public.recast_runs_overdue() from public, anon, authenticated;
grant execute on function public.recast_runs_overdue() to service_role;

drop function if exists public.submit_waiver_claim(uuid, int, uuid);
drop function if exists public.process_reverse_standings_waivers(uuid);
drop function if exists public.approve_waiver_claim(uuid);
drop function if exists public.reject_waiver_claim(uuid);
drop function if exists public.finalize_waiver_claim(uuid);
