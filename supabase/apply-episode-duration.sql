-- Adds an episode's broadcast length so the Home banner can tell when a live
-- episode has ended. Existing rows get the 2-hour default.
alter table public.episodes
  add column duration_minutes int not null default 120 check (duration_minutes > 0);

comment on column public.episodes.duration_minutes is
  'Broadcast length in minutes; set on Schedule. Drives when the Home banner leaves On Air Now.';
