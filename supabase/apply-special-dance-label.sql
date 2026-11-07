-- Error messages name a special dance by the app's naming rule (Kylie,
-- 2026-11-06, src/lib/special-dance-names.ts specialDanceFullName): the Dance
-- Type in front unless the name already says it, so "Team Dance · Slaytopia"
-- and "Dance-Off 2", and an auto-named team stays "Team Dance 2" instead of
-- "Team Team Dance 2". Only message text changes. Rehearsed in
-- src/lib/special-dance-label-db.test.ts.
create or replace function public.special_dance_label(p_team public.episode_teams)
returns text language sql immutable set search_path = '' as $$
  select case
    when nullif(btrim(p_team.name), '') is null or nullif(btrim(p_team.dance_type), '') is null
      then coalesce(nullif(btrim(p_team.name), ''), btrim(p_team.dance_type))
    when strpos(lower(btrim(p_team.name)), lower(btrim(p_team.dance_type))) > 0 then btrim(p_team.name)
    else btrim(p_team.dance_type) || ' · ' || btrim(p_team.name)
  end;
$$;
revoke all on function public.special_dance_label(public.episode_teams) from public, anon, authenticated;
grant execute on function public.special_dance_label(public.episode_teams) to service_role;
