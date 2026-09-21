-- Restores effective_grand_finale_deadline to its schema.sql definition
-- (hard-deadline week only), undoing the elimination-based early lock.
-- Owner-run via the Supabase SQL Editor.
create or replace function public.effective_grand_finale_deadline(p_league_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select min(e.airs_at)
  from public.episodes e
  join public.competition_weeks w on w.id = e.week_id
  where w.season_id = public.active_season_id()
    and w.week_number = public.effective_hard_deadline_week(p_league_id);
$$;
