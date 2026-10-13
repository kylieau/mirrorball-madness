-- Fantasy judges points use each dance's judges' average × 3 (scaled_score),
-- so a guest-judge night (out of 40) or a missing judge (out of 20) pays on
-- the same 30-point basis the scoring defaults were calibrated on.
-- total_score stays the raw sum fans see. Written by the app at save time.

alter table public.dance_scores add column scaled_score numeric;
alter table public.draft_dance_scores add column scaled_score numeric;

update public.dance_scores d
set scaled_score = coalesce(
  (select sum(j.score) * 3.0 / count(*) from public.judge_scores j where j.dance_score_id = d.id),
  0
);

update public.draft_dance_scores d
set scaled_score = coalesce(
  (select sum(j.score) * 3.0 / count(*) from public.draft_judge_scores j where j.draft_dance_score_id = d.id),
  0
);

alter table public.dance_scores alter column scaled_score set not null;
alter table public.dance_scores alter column scaled_score set default 0;
alter table public.draft_dance_scores alter column scaled_score set not null;
alter table public.draft_dance_scores alter column scaled_score set default 0;

-- Return columns change, so drop and recreate.
drop function public.visible_draft_dance_scores();

create function public.visible_draft_dance_scores()
returns table (
  episode_id uuid,
  week_id uuid,
  week_number int,
  couple_id uuid,
  dance_style_name text,
  total_score numeric,
  scaled_score numeric,
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
    d.scaled_score,
    d.created_at
  from public.draft_dance_scores d
  join public.episodes e on e.id = d.episode_id
  join public.competition_weeks w on w.id = e.week_id
  join public.dance_styles s on s.id = d.dance_style_id
  join public.draft_couple_releases r on r.episode_id = d.episode_id and r.couple_id = d.couple_id
  join public.spoiler_watch_progress p
    on p.user_id = auth.uid()
   and p.season_id = e.season_id
  where e.results_published_at is null
    and p.draft_unlocked_week >= w.week_number;
$$;

revoke execute on function public.visible_draft_dance_scores() from public;
grant execute on function public.visible_draft_dance_scores() to authenticated;
