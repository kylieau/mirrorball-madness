-- Waiver runs 48 hours after a week's results are posted (Kylie, 2026-11-10),
-- not 48 hours after its last night aired. Until every night of the week is
-- published the run has no due time, and it never runs without results (the
-- old run-anyway-after-a-day fallback is gone). A correction that republishes
-- the week before its run moves the run later; one after the run changes
-- nothing, since recast_cycles already stamps it.
--
-- Apply after apply-recast-v2.sql and apply-trades.sql, and after deploying
-- the app that reads a blank due time as "48 hours after results are posted".
-- Safe to run again.

-- The league's next run: the latest week whose results were posted 48 hours
-- ago if it hasn't been processed, else the week after. Earlier unprocessed
-- weeks are skipped, as is any week that came due before Recast was turned on,
-- and the season's last week never has a run. due_at is null until the week's
-- results are all posted; start_week is the first week that won't have aired
-- when the run happens (for a run not yet timed, as if results went up as
-- soon as they could: now, or after the week's last night if that is later).
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
           max(e.airs_at) as last_airs_at,
           case when bool_and(e.results_published_at is not null)
                then max(e.results_published_at) + interval '48 hours' end as due_at,
           bool_and(e.results_published_at is not null) as results_in
    from public.competition_weeks w
    join public.episodes e on e.week_id = w.id
    where w.season_id = public.active_season_id()
    group by w.id
  )
  select c.id, c.week_number, c.due_at, c.results_in,
         (select min(n.week_number) from weeks n
          where n.week_number > c.week_number
            and n.first_airs_at > greatest(coalesce(c.due_at, greatest(c.last_airs_at, now()) + interval '48 hours'), now()))
  from weeks c
  where c.week_number >= coalesce((select max(d.week_number) from weeks d where d.due_at <= now()), 0)
    and c.week_number < coalesce(
      (select min(f.week_number) from weeks f where f.is_finale),
      (select max(l.week_number) from weeks l)
    )
    and public.recast_runs_since(p_league_id) is not null
    and (c.due_at is null or c.due_at > public.recast_runs_since(p_league_id))
    and not exists (
      select 1 from public.recast_cycles rc where rc.league_id = p_league_id and rc.week_id = c.id
    )
  order by c.week_number
  limit 1;
$$;
revoke execute on function public.recast_next_cycle(uuid) from public, anon;
grant execute on function public.recast_next_cycle(uuid) to authenticated, service_role;

-- The scheduled job: every league whose run is due. A week whose results
-- aren't all posted has no due time and waits. Safe to call as often as
-- wanted; one league failing doesn't stop the rest.
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
    continue when v_cycle.week_number is null or v_cycle.start_week is null
      or v_cycle.due_at is null or v_cycle.due_at > now();
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

-- For the site admin's notice: runs that are due and haven't happened, which
-- now only means stuck, since a run isn't due until its results are posted.
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
