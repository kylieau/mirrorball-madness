-- Season 35 schedule, Weeks 3-11. Owner-run via the Supabase SQL Editor.
-- Idempotent: Week 3 is only retitled while it still says 'test', and the
-- inserts skip any week/episode number that already exists.
--
-- Times follow the existing convention (Tuesday 8pm ET => 00:00 UTC next day,
-- 01:00 UTC after DST ends Nov 1). Not given, so ASSUMED weekly Tuesdays and
-- editable on Admin > Schedule: Week 5 (Oct 13), Week 10 (Nov 17),
-- Week 11 (Nov 24). Week 7 is a Wednesday as stated.
do $$
declare
  v_season_id uuid := (select id from public.seasons where is_active);
begin
  update public.competition_weeks
  set theme = 'Yacht Rock Night'
  where season_id = v_season_id and week_number = 3 and theme = 'test';

  update public.episodes
  set theme = 'Yacht Rock Night'
  where season_id = v_season_id and episode_number = 4 and theme = 'test';

  insert into public.competition_weeks (season_id, week_number, theme, is_finale)
  values
    (v_season_id, 4,  'Mariah Carey Night', false),
    (v_season_id, 5,  null,                 false), -- TBA / not yet revealed
    (v_season_id, 6,  'Dedication Night',   false),
    (v_season_id, 7,  'Horror Movie Night', false),
    (v_season_id, 8,  'Disney Night',       false),
    (v_season_id, 9,  'Grammy Night',       false),
    (v_season_id, 10, 'Semi-Finals',        false),
    (v_season_id, 11, 'Finale',             true)
  on conflict (season_id, week_number) do nothing;

  insert into public.episodes (season_id, episode_number, week_id, airs_at, theme)
  select v_season_id, s.episode_number, w.id, s.airs_at::timestamptz, w.theme
  from (values
    (5,  4,  '2026-10-07 00:00+00'),
    (6,  5,  '2026-10-14 00:00+00'),
    (7,  6,  '2026-10-21 00:00+00'),
    (8,  7,  '2026-10-29 00:00+00'),
    (9,  8,  '2026-11-04 01:00+00'),
    (10, 9,  '2026-11-11 01:00+00'),
    (11, 10, '2026-11-18 01:00+00'),
    (12, 11, '2026-11-25 01:00+00')
  ) as s(episode_number, week_number, airs_at)
  join public.competition_weeks w
    on w.season_id = v_season_id and w.week_number = s.week_number
  on conflict (season_id, episode_number) do nothing;
end
$$;
