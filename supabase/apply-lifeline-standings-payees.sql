-- weekly_manager_standings lists every team and week with a score row, a
-- Lifeline payout or a point adjustment (Codex review, 2026-11-20). Score rows
-- are only written for a team with roster points or a pick, so a Lifeline paid
-- to a team that held no couple and picked nothing that week was dropped from
-- standings. Same columns, names and types as before; safe to run again.

create or replace view public.weekly_manager_standings with (security_invoker = true) as
with keys as (
  select league_id, manager_id, week_id from public.weekly_manager_scores
  union
  select league_id, manager_id, week_id from public.lifeline_payouts
  union
  select league_id, manager_id, week_id from public.league_point_adjustments
)
select
  k.league_id,
  k.manager_id,
  k.week_id,
  coalesce(s.roster_points, 0) as roster_points,
  coalesce(s.prediction_points, 0) as prediction_points,
  coalesce(s.grand_finale_points, 0) as grand_finale_points,
  coalesce(l.points, 0) + coalesce(a.lifeline, 0) as lifeline_points,
  coalesce(a.transfers, 0) as transfer_points,
  coalesce(s.total_points, 0) + coalesce(l.points, 0) + coalesce(a.lifeline, 0) + coalesce(a.transfers, 0) as total_points
from keys k
left join public.weekly_manager_scores s
  on s.league_id = k.league_id and s.manager_id = k.manager_id and s.week_id = k.week_id
left join lateral (
  select sum(p.weighted_points) as points
  from public.lifeline_payouts p
  where p.league_id = k.league_id and p.manager_id = k.manager_id and p.week_id = k.week_id
) l on true
left join lateral (
  select sum(a.weighted_points) filter (where a.kind = 'lifeline_equalizer') as lifeline,
         sum(a.weighted_points) filter (where a.kind = 'trade_transfer') as transfers
  from public.league_point_adjustments a
  where a.league_id = k.league_id and a.manager_id = k.manager_id and a.week_id = k.week_id
) a on true;
grant select on public.weekly_manager_standings to authenticated, service_role;
