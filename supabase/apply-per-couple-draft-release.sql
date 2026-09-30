-- Draft Scores becomes per-couple instead of a whole-episode, all-couples-
-- scored gate. Any commissioner (propose tier) can release or withdraw one
-- couple's drafted dance at a time as it airs, rather than waiting for
-- every couple in the night to be scored before anything can be shown to
-- Spoiler-Free fans who marked the week watched.
--
-- Run this whole file in the Supabase Dashboard SQL Editor before the next
-- Enter Results session. Safe to re-run. schema.sql stays the greenfield
-- source of truth and already reflects this end state.

create table if not exists public.draft_couple_releases (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  released_at timestamptz not null default now(),
  released_by uuid not null references public.profiles(id) on delete set null,
  primary key (episode_id, couple_id)
);

comment on table public.draft_couple_releases is
  'A commissioner or site admin released this couple''s drafted dance for the
   night, for fans who marked the week watched. Cleared on withdraw or when
   the episode''s draft is published/re-seeded (deleteAllDraftRows).';

-- No scores in this table, just which couples are released -- same
-- public-readability as the old episodes.scores_drafted_at column it
-- replaces. The actual score rows stay behind the security-definer
-- visible_draft_dance_scores() RPC. Grant alone is not enough once RLS is
-- on: without a SELECT policy, authenticated reads return zero rows.
grant select on public.draft_couple_releases to authenticated;
alter table public.draft_couple_releases enable row level security;
drop policy if exists "draft couple releases are viewable by all authenticated users"
  on public.draft_couple_releases;
create policy "draft couple releases are viewable by all authenticated users"
on public.draft_couple_releases for select
to authenticated
using (true);

-- Backfill: any night already released whole-episode under the old model
-- becomes one release row per couple that already has a scored dance, so no
-- in-flight release is lost when the old columns are dropped below.
insert into public.draft_couple_releases (episode_id, couple_id, released_at, released_by)
select distinct d.episode_id, d.couple_id, e.scores_drafted_at, e.scores_drafted_by
from public.draft_dance_scores d
join public.episodes e on e.id = d.episode_id
join public.draft_judge_scores j on j.draft_dance_score_id = d.id
where e.scores_drafted_at is not null
  and e.scores_drafted_by is not null
on conflict (episode_id, couple_id) do nothing;

-- Per-couple now, not "e.scores_drafted_at is not null" for the whole night.
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
  join public.draft_couple_releases r on r.episode_id = d.episode_id and r.couple_id = d.couple_id
  join public.spoiler_watch_progress p
    on p.user_id = auth.uid()
   and p.season_id = e.season_id
  where e.results_published_at is null
    and p.draft_unlocked_week >= w.week_number;
$$;

revoke execute on function public.visible_draft_dance_scores() from public;
grant execute on function public.visible_draft_dance_scores() to authenticated;

-- Superseded by draft_couple_releases.
alter table public.episodes drop column if exists scores_drafted_at;
alter table public.episodes drop column if exists scores_drafted_by;
