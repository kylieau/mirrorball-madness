-- Lets a Spoiler-Free viewer undo "Mark as watched": lowers their watched
-- high-water mark so the chosen week and every later week are hidden again.
-- It can only ever lower the mark and only touches the caller's own row.
create or replace function public.unmark_episodes_watched_from(p_week_number int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid := public.active_season_id();
begin
  if v_season_id is null then
    raise exception 'No active season';
  end if;

  if p_week_number is null or p_week_number < 1 then
    raise exception 'Week number must be at least 1';
  end if;

  update public.spoiler_watch_progress
  set last_watched_week = least(last_watched_week, p_week_number - 1),
      updated_at = now()
  where user_id = auth.uid() and season_id = v_season_id;
end;
$$;

revoke execute on function public.unmark_episodes_watched_from(int) from public;
grant execute on function public.unmark_episodes_watched_from(int) to authenticated;
