-- Read-only. Run after supabase/apply-episode-rounds.sql and paste the one
-- result back. Expected: tables 3, columns 2, functions 12, episodes_without_plan 0;
-- E09 = Individual Dance + Team Dance (Wildcats 1, Slaytopia 2);
-- E10 = Individual Dance + Dance-Off fixed_bonus (Dance-Off 1, 2, 3 in points),
-- plus an immunity row if a hand-made Immunity special existed.
select jsonb_build_object(
  'tables', (select count(*) from information_schema.tables where table_schema = 'public'
             and table_name in ('episode_rounds', 'episode_round_exceptions', 'episode_team_couple_marks')),
  'columns', (select count(*) from information_schema.columns where table_schema = 'public'
              and table_name = 'episode_teams' and column_name in ('round_id', 'heat_number')),
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                and p.proname in ('round_special_mode', 'round_heat_name', 'drop_round_unit', 'drop_round_units',
                  'sync_round_immunity', 'refresh_round_points', 'couple_night_exception', 'apply_round_exception',
                  'save_round_exception', 'set_round_bonus', 'save_team_couple_marks', 'save_episode_rounds')),
  'episodes_without_plan', (select count(*) from public.episodes e
                            where not exists (select 1 from public.episode_rounds r where r.episode_id = e.id)),
  'plans', (select jsonb_agg(jsonb_build_object(
      'episode', e.episode_number, 'round', r.position, 'type', r.round_type, 'scoring', r.scoring, 'units', r.unit_count,
      'heats', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'heat', t.heat_number, 'mode', t.scoring_mode,
                  'members', (select count(*) from public.episode_team_members m where m.team_id = t.id))
                  order by t.heat_number nulls last), '[]'::jsonb)
                from public.episode_teams t where t.round_id = r.id),
      'exceptions', (select count(*) from public.episode_round_exceptions x where x.round_id = r.id))
      order by e.episode_number, r.position)
    from public.episodes e join public.episode_rounds r on r.episode_id = e.id
    join public.seasons s on s.id = e.season_id and s.is_active
    where e.episode_number in (9, 10))
) as result;
