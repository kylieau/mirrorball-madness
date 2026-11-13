-- Trades take effect when their veto window closes (Kylie, 2026-11-12),
-- not only at the next waiver run. Until now a trade executed inside the
-- run alone, 48 hours after a week's results, so one accepted after a run
-- waited a week and started scoring the week after that. Now the scheduled
-- job executes every accepted trade whose window has closed, every 15
-- minutes, and the couples move from the first week whose first night
-- hasn't aired (release_effective_week, the rule a removal uses). Points
-- still land on the latest week with results.
--
-- Apply after apply-trades.sql, apply-recast-after-results.sql and
-- apply-remove-manager.sql. Safe to run again. The pg_cron job is unchanged:
-- process_due_recasts now ends by calling process_due_trades.
--
-- What changes:
--   1. run_league_trades holds while an aired competition night is
--      unpublished (a couple's status is stale until Finish Week), and fails
--      a trade whose start week is past the Finale with no_week_left.
--   2. process_due_trades: every league with Trades on, under the league
--      lock the run takes, with the effective week.
--   3. process_due_recasts runs the due waiver cycles first (their order is
--      read before any trade's points move), then process_due_trades.
--   4. assert_trades_open asks for a week still to air before the Finale,
--      not a waiver run still to come.

alter table public.trade_offers drop constraint if exists trade_offers_result_check;
alter table public.trade_offers add constraint trade_offers_result_check
  check (result in ('not_dancing', 'not_held', 'no_room', 'cash_cap', 'left_league', 'no_scored_week', 'no_week_left'));

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
  -- A couple's status only changes at Finish Week, so between a night's
  -- curtain and its publish the whole-or-nothing check would read who was
  -- dancing before the show. Trades wait for the results; lapsed offers
  -- are still marked below.
  v_hold boolean := exists (
    select 1 from public.episodes e
    where e.season_id = public.active_season_id() and e.week_id is not null
      and e.airs_at <= now() and e.results_published_at is null
  );
  v_last_week int := (
    select coalesce(min(w.week_number) filter (where w.is_finale), max(w.week_number))
    from public.competition_weeks w where w.season_id = public.active_season_id()
  );
begin
  for v_trade in
    select * from public.trade_offers
    where league_id = p_league_id and status = 'accepted' and veto_ends_at <= now()
    order by accepted_at, id
  loop
    exit when v_hold;
    v_problem := public.trade_problem(v_trade.id, true);
    if v_problem is null and p_start_week > v_last_week then v_problem := 'no_week_left'; end if;
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
  if public.release_effective_week() > (
    select coalesce(min(w.week_number) filter (where w.is_finale), max(w.week_number))
    from public.competition_weeks w where w.season_id = public.active_season_id()
  ) then
    raise exception 'There is no week left for a trade to take effect in';
  end if;
end;
$$;
revoke all on function public.assert_trades_open(uuid) from public, anon, authenticated;

-- Every league's trades whose veto window has closed, from the first week
-- that hasn't aired. One league failing doesn't stop the rest.
create or replace function public.process_due_trades()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_start int := public.release_effective_week();
  v_done int;
  v_runs jsonb := '[]'::jsonb;
begin
  for v_league_id in
    select id from public.leagues where trades_enabled order by id
  loop
    begin
      perform 1 from public.leagues where id = v_league_id for update;
      v_done := public.run_league_trades(v_league_id, v_start - 1, v_start);
      if v_done > 0 then
        v_runs := v_runs || jsonb_build_object('league_id', v_league_id, 'trades', v_done, 'start_week', v_start);
      end if;
    exception when others then
      raise warning 'Trade execution failed for league %: %', v_league_id, sqlerrm;
      v_runs := v_runs || jsonb_build_object('league_id', v_league_id, 'error', sqlerrm);
    end;
  end loop;
  return v_runs;
end;
$$;
revoke all on function public.process_due_trades() from public, anon, authenticated;
grant execute on function public.process_due_trades() to service_role;

-- The scheduled job (`process-due-recasts`, every 15 minutes) now covers
-- both: the due waiver runs, then the trades whose windows have closed.
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
  -- After the runs, so a trade clearing on this tick can't move points
  -- before a due run reads its waiver order.
  perform public.process_due_trades();
  return v_runs;
end;
$$;
revoke all on function public.process_due_recasts() from public, anon, authenticated;
grant execute on function public.process_due_recasts() to service_role;
