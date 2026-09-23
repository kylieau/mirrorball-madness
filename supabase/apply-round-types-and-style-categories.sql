-- Phase 2 Show Settings taxonomy.
--
-- Round types (Team Dance, Trio Dance, …) become a managed table, assigned
-- on the episode. Dance styles gain a closed category. episodes.expected_dance_count
-- stays, but Schedule owns it from here on — publish must not overwrite it.
--
-- Migrates episode_results.was_team_dance = true into one episode_round_types
-- row per episode (Team Dance), then drops the column from the live and draft
-- results tables. Draft rows are transient; no draft data is copied.
--
-- Run this in the Supabase Dashboard SQL Editor (one shot). Then regenerate
-- types — the copy in this PR was hand-updated because the live project does
-- not have these tables until this file runs:
--   npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts

begin;

alter table public.dance_styles
  add column category text check (category in ('ballroom', 'latin', 'show'));

comment on column public.dance_styles.category is
  'Closed grouping: ballroom, latin, or show. Null until categorized in Show Settings.';

create table public.round_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

grant select on public.round_types to authenticated;

create policy "round types are viewable by all authenticated users"
on public.round_types for select
using (true);

insert into public.round_types (name) values
  ('Team Dance'),
  ('Trio Dance'),
  ('Instant Dance'),
  ('Judges'' Choice'),
  ('Redemption Dance');

create table public.episode_round_types (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  round_type_id uuid not null references public.round_types(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, round_type_id)
);

create index idx_episode_round_types_episode on public.episode_round_types(episode_id);

grant select on public.episode_round_types to authenticated;

create policy "episode round types are viewable by all authenticated users"
on public.episode_round_types for select
using (true);

insert into public.episode_round_types (episode_id, round_type_id)
select distinct er.episode_id, rt.id
from public.episode_results er
join public.round_types rt on rt.name = 'Team Dance'
where er.was_team_dance = true;

alter table public.episode_results drop column was_team_dance;
alter table public.draft_episode_results drop column was_team_dance;

comment on column public.episodes.expected_dance_count is
  'Set on Schedule (dances per couple). A soft cap for Enter Results, not a hard limit. Publish does not overwrite it.';

commit;
