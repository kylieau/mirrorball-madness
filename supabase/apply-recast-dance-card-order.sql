-- The waiver order is reverse Dance Card standings, not reverse total
-- standings (Kylie, 2026-11-13): a waiver claim can only change Dance Card
-- points, so the wire goes first to the roster that needs it, not to the
-- manager losing on Curtain Call or Grand Finale. The points are what
-- Standings shows as the Dance Card total: roster points at the league's
-- Dance Card weight plus Lifeline, Equalizer and trade transfer points,
-- which are stored already weighted. Tie-breaks are unchanged: the lower
-- latest week on the same points, then whoever picked later in the draft.
--
-- Apply after apply-recast-after-results.sql, once the Week 9 run has
-- stamped recast_cycles (changing the rule between a contested claim being
-- saved and its run decides it on a rule nobody saw). Deploy the app that
-- reads dance_card_total with it: the Waiver Order fold mirrors this
-- function. Safe to run again.

begin;

drop function if exists public.recast_order(uuid);

create function public.recast_order(p_league_id uuid)
returns table (manager_id uuid, list_position int, dance_card_total numeric, last_week_dance_card numeric)
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
  ), weighted as (
    select s.manager_id,
           s.week_id,
           s.roster_points * coalesce(
             (select c.judges_score_category_weight from public.scoring_settings c where c.league_id = p_league_id), 1
           ) + s.lifeline_points + s.transfer_points as dance_card
    from public.weekly_manager_standings s
    join weeks w on w.id = s.week_id
    where s.league_id = p_league_id
  ), totals as (
    select manager_id,
           -- Compared in cents, as recastOrder in the app compares them.
           round(sum(dance_card), 2) as dance_card_total,
           round(sum(dance_card) filter (where week_id = (select id from last_week)), 2) as last_week_dance_card
    from weighted
    group by manager_id
  )
  select m.user_id,
         row_number() over (
           order by coalesce(t.dance_card_total, 0), coalesce(t.last_week_dance_card, 0),
                    case when l.draft_type = 'custom' then array_position(l.custom_pick_order, m.user_id) else m.draft_position end
                      desc nulls last,
                    m.user_id
         )::int,
         coalesce(t.dance_card_total, 0),
         coalesce(t.last_week_dance_card, 0)
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  left join totals t on t.manager_id = m.user_id
  where m.league_id = p_league_id;
$$;
revoke all on function public.recast_order(uuid) from public, anon, authenticated;
grant execute on function public.recast_order(uuid) to service_role;

commit;
