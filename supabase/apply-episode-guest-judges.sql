-- Guest judges are set per episode on Schedule. Enter Results shows score
-- boxes for the standing panel (people role = judge, not archived) plus only
-- that episode's guests. A guest added by name on Schedule is created
-- archived, so they never join the standing panel or other nights.

create table public.episode_guest_judges (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  judge_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  primary key (episode_id, judge_id)
);

create index idx_episode_guest_judges_episode on public.episode_guest_judges(episode_id);

alter table public.episode_guest_judges enable row level security;

grant select on public.episode_guest_judges to authenticated;
create policy "episode guest judges are viewable by all authenticated users"
on public.episode_guest_judges for select
using (true);
