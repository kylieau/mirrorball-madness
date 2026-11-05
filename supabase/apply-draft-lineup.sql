-- Fans see an unpublished week's announced dances (each couple's style and
-- song) on Results and in Picks' couple dropdowns, as soon as anyone entering
-- results saves them on Enter Results. Only style and song: never a score,
-- and never a published episode's leftover correction draft.
--
-- Run this whole file in the Supabase Dashboard SQL Editor. Safe to re-run.
-- A Vercel deploy does not apply it; until it runs, the app shows no lineup.

create or replace function public.visible_draft_lineup()
returns table (
  episode_id uuid,
  week_id uuid,
  couple_id uuid,
  dance_style_name text,
  song_title text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.episode_id, e.week_id, d.couple_id, s.name, d.song_title, d.created_at
  from public.draft_dance_scores d
  join public.episodes e on e.id = d.episode_id
  join public.dance_styles s on s.id = d.dance_style_id
  where e.results_published_at is null
    and e.week_id is not null
    and e.season_id = public.active_season_id();
$$;

revoke all on function public.visible_draft_lineup() from public, anon;
grant execute on function public.visible_draft_lineup() to authenticated;
