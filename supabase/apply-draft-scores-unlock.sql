-- Site Admin can release a night's Enter Results draft before official
-- publish. Fans who chose Mark Watched (finished the East broadcast) can
-- read those dances. Stay Updated only advances last_watched_week and does
-- not unlock drafts. Draft tables stay ungranted; the read RPC is the gate.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.episodes
  add column if not exists scores_drafted_at timestamptz;

alter table public.episodes
  add column if not exists scores_drafted_by uuid references public.profiles(id) on delete set null;

comment on column public.episodes.scores_drafted_at is
  'Site Admin released this night''s draft scores for fans who marked the week watched. Cleared on withdraw or official publish.';

alter table public.spoiler_watch_progress
  add column if not exists draft_unlocked_week int not null default 0 check (draft_unlocked_week >= 0);

comment on column public.spoiler_watch_progress.draft_unlocked_week is
  'Highest week whose released draft scores this user chose to see via Mark Watched. Stay Updated does not raise it.';

-- Mark Watched / I've finished it: advances the spoiler high-water and the
-- draft unlock together. Stay Updated keeps calling mark_episodes_watched_through.
create or replace function public.unlock_draft_scores_through(p_week_number int)
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

  insert into public.spoiler_watch_progress (user_id, season_id, last_watched_week, draft_unlocked_week, updated_at)
  values (auth.uid(), v_season_id, p_week_number, p_week_number, now())
  on conflict (user_id, season_id)
  do update set
    last_watched_week = greatest(public.spoiler_watch_progress.last_watched_week, excluded.last_watched_week),
    draft_unlocked_week = greatest(public.spoiler_watch_progress.draft_unlocked_week, excluded.draft_unlocked_week),
    updated_at = now();
end;
$$;

revoke execute on function public.unlock_draft_scores_through(int) from public;
grant execute on function public.unlock_draft_scores_through(int) to authenticated;

-- Going backward hides drafts for the unmarked weeks too.
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
      draft_unlocked_week = least(draft_unlocked_week, p_week_number - 1),
      updated_at = now()
  where user_id = auth.uid() and season_id = v_season_id;
end;
$$;

revoke execute on function public.unmark_episodes_watched_from(int) from public;
grant execute on function public.unmark_episodes_watched_from(int) to authenticated;

-- Dance rows from a released, unpublished draft, only for weeks this caller
-- unlocked. security definer reads the ungranted draft tables.
create or replace function public.visible_draft_dance_scores()
returns table (
  episode_id uuid,
  week_id uuid,
  week_number int,
  couple_id uuid,
  dance_style_name text,
  total_score numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.episode_id,
    e.week_id,
    w.week_number,
    d.couple_id,
    s.name,
    d.total_score,
    d.created_at
  from public.draft_dance_scores d
  join public.episodes e on e.id = d.episode_id
  join public.competition_weeks w on w.id = e.week_id
  join public.dance_styles s on s.id = d.dance_style_id
  join public.spoiler_watch_progress p
    on p.user_id = auth.uid()
   and p.season_id = e.season_id
  where e.scores_drafted_at is not null
    and e.results_published_at is null
    and p.draft_unlocked_week >= w.week_number;
$$;

revoke execute on function public.visible_draft_dance_scores() from public;
grant execute on function public.visible_draft_dance_scores() to authenticated;
