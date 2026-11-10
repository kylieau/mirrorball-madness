-- Dance Card v3 (docs/design/dance-card-v3/, Kylie 2026-11-10): one judges'
-- rate all season, survival tapering as 3.00 × √(survival weeks), the Fantasy
-- Bonus at face value, no placement. It pays week by week from a couple's
-- history like v2, so it reuses v2's machinery. Apply after
-- apply-dance-card-v2.sql and before deploying the app that reads 'v3'.
-- Switching a league is still scripts/dance-card-v2.ts --apply.
-- apply-dance-card-v3-default.sql (new leagues start on v3) goes on only
-- after that deploy.
--
-- What changes:
--   1. scoring_settings.dance_card_version also accepts 'v3'.
--   2. Every v2-only check also covers v3: the Anchor Week guard, the reveal
--      order guard, the later-weeks rebuild and set_dance_card_points.
--   3. assert_special_dance_plan refuses a plan below version 5 while any
--      league is on v3.

do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.scoring_settings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%dance_card_version%'
  loop
    execute format('alter table public.scoring_settings drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.scoring_settings
  add constraint scoring_settings_dance_card_version_check check (dance_card_version in ('v1', 'v2', 'v3'));

create or replace function public.guard_dance_card_anchor()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.judges_score_starts_week is distinct from old.judges_score_starts_week
     and new.dance_card_version in ('v2', 'v3')
     and exists (
       select 1 from public.weekly_manager_scores s
       join public.competition_weeks w on w.id = s.week_id
       where s.league_id = new.league_id
         and w.season_id = (select id from public.seasons where is_active limit 1)
     ) then
    raise exception 'This league scores Dance Card week by week from its Anchor Week, so the Anchor Week can''t move once weeks are scored.';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.assert_special_dance_plan(p_episode_id uuid, p_plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_later int;
begin
  if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 2
     and exists (select 1 from public.episode_teams where episode_id = p_episode_id and scoring_mode = 'points') then
    raise exception 'This episode has a special dance scored in points, which this version of the app cannot score. Reload the page and try again.';
  end if;
  if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 3
     and exists (select 1 from public.episode_teams where episode_id = p_episode_id and scoring_mode = 'couple_marks') then
    raise exception 'This episode has a special dance scored by each couple''s marks, which this version of the app cannot score. Reload the page and try again.';
  end if;
  if exists (select 1 from public.scoring_settings where dance_card_version = 'v3')
     and coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 5 then
    raise exception 'A league scores Dance Card with tapering survival, which this version of the app cannot score. Reload the page and try again.';
  end if;
  if exists (select 1 from public.scoring_settings where dance_card_version in ('v2', 'v3')) then
    if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 4 then
      raise exception 'A league scores Dance Card week by week, which this version of the app cannot score. Reload the page and try again.';
    end if;
    if not (p_plan ? 'laterDanceCard') then
      select min(w.week_number) into v_later
      from public.weekly_manager_scores s
      join public.competition_weeks w on w.id = s.week_id
      join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version in ('v2', 'v3')
      where w.season_id = (select id from public.seasons where is_active limit 1)
        and w.week_number > (select cw.week_number from public.episodes e join public.competition_weeks cw on cw.id = e.week_id where e.id = p_episode_id);
      if v_later is not null then
        raise exception 'Week % already has scores. Publish weeks in order.', v_later;
      end if;
    end if;
  end if;
end;
$function$;

create or replace function public.apply_later_dance_card(p_episode_id uuid, p_plan jsonb)
returns void language plpgsql set search_path = ''
as $$
declare
  v_week int;
  v_season uuid := (select id from public.seasons where is_active limit 1);
  v_rows jsonb := coalesce(p_plan->'laterDanceCard', '[]'::jsonb);
  v_given int;
  v_matched int;
  v_expected int;
begin
  select cw.week_number into v_week
  from public.episodes e join public.competition_weeks cw on cw.id = e.week_id
  where e.id = p_episode_id;
  if jsonb_typeof(v_rows) is distinct from 'array' then
    raise exception 'Later Dance Card rows must be a list';
  end if;
  select count(*), count(distinct (league_id, manager_id, week_id)) filter (
           where roster_points is not null and total_points is not null
             and abs(roster_points) < 1000000 and abs(total_points) < 1000000
             and roster_points = round(roster_points, 2) and total_points = round(total_points, 2))
    into v_given, v_matched
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric);
  if v_given <> v_matched then
    raise exception 'Later Dance Card rows must be unique, in cents';
  end if;
  if v_week is null then
    if v_given > 0 then raise exception 'Later Dance Card rows need a competition week'; end if;
    return;
  end if;

  select count(*) into v_matched
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric)
  join public.weekly_manager_scores s on s.league_id = r.league_id and s.manager_id = r.manager_id and s.week_id = r.week_id
  join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season and w.week_number > v_week
  join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version in ('v2', 'v3')
  where abs(r.total_points - round(
    r.roster_points * st.judges_score_category_weight
    + s.prediction_points * st.eliminations_category_weight
    + s.grand_finale_points * st.bonus_picks_category_weight, 2)) <= 0.01;
  select count(*) into v_expected
  from public.weekly_manager_scores s
  join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season and w.week_number > v_week
  join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version in ('v2', 'v3');
  if v_matched <> v_given or v_given <> v_expected then
    raise exception 'Later weeks'' Dance Card is out of date (% of % rows). Refresh and try again.', v_matched, v_expected;
  end if;

  update public.weekly_manager_scores s
  set roster_points = r.roster_points, total_points = r.total_points, computed_at = now()
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric)
  where s.league_id = r.league_id and s.manager_id = r.manager_id and s.week_id = r.week_id;
end;
$$;

create or replace function public.set_dance_card_points(
  p_actor_id uuid, p_league_id uuid, p_revision text, p_version text, p_migration_id uuid, p_rows jsonb
)
returns int language plpgsql set search_path = '' set lock_timeout = '5s'
as $$
declare
  v_season uuid;
  v_given int;
  v_unique int;
  v_matched int;
  v_expected int;
begin
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.episode_participants, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;

  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Not authorized to change Dance Card scoring';
  end if;
  if p_revision is null or p_revision is distinct from public.dance_card_snapshot()->>'_revision' then
    raise exception 'Scores changed since this was prepared. Run it again.';
  end if;
  v_season := (select id from public.seasons where is_active limit 1);
  if p_version is null then
    if not exists (select 1 from public.scoring_settings where league_id = p_league_id and dance_card_version in ('v2', 'v3')) then
      raise exception 'Only a league already on v2 or v3 can be rebuilt in place';
    end if;
  else
    if p_version not in ('v1', 'v2', 'v3') then raise exception 'Unknown Dance Card version %', p_version; end if;
    if exists (
      select 1 from public.episodes e
      where e.season_id = v_season and e.results_published_at is null
        and exists (select 1 from public.dance_scores d where d.episode_id = e.id)
    ) then
      raise exception 'Scores are posting for an unpublished episode. Switch between a publish and the next curtain.';
    end if;
    if p_migration_id is null then raise exception 'A version switch needs a migration id'; end if;
    if exists (select 1 from public.weekly_manager_scores_archive where migration_id = p_migration_id) then
      raise exception 'Migration id % was already used', p_migration_id;
    end if;
    insert into public.weekly_manager_scores_archive
      (migration_id, league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points, dance_card_version)
    select p_migration_id, s.league_id, s.manager_id, s.week_id, s.roster_points, s.prediction_points, s.grand_finale_points, s.total_points, st.dance_card_version
    from public.weekly_manager_scores s
    join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season
    join public.scoring_settings st on st.league_id = s.league_id
    where s.league_id = p_league_id;
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be a list'; end if;
  select count(*), count(distinct (league_id, manager_id, week_id)) filter (
           where roster_points is not null and total_points is not null
             and abs(roster_points) < 1000000 and abs(total_points) < 1000000
             and roster_points = round(roster_points, 2) and total_points = round(total_points, 2))
    into v_given, v_unique
  from jsonb_to_recordset(p_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric);
  select count(*) into v_matched
  from jsonb_to_recordset(p_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric)
  join public.weekly_manager_scores s on s.league_id = r.league_id and s.manager_id = r.manager_id and s.week_id = r.week_id
  join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season
  join public.scoring_settings st on st.league_id = s.league_id
  where r.league_id = p_league_id
    and abs(r.total_points - round(
      r.roster_points * st.judges_score_category_weight
      + s.prediction_points * st.eliminations_category_weight
      + s.grand_finale_points * st.bonus_picks_category_weight, 2)) <= 0.01;
  select count(*) into v_expected
  from public.weekly_manager_scores s
  join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season
  where s.league_id = p_league_id;
  if v_given <> v_unique or v_matched <> v_given or v_given <> v_expected then
    raise exception 'Rows must cover each of the league''s % stored rows exactly once (% given, % matched)', v_expected, v_given, v_matched;
  end if;

  update public.weekly_manager_scores s
  set roster_points = r.roster_points, total_points = r.total_points, computed_at = now()
  from jsonb_to_recordset(p_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric)
  where s.league_id = r.league_id and s.manager_id = r.manager_id and s.week_id = r.week_id;
  if p_version is not null then
    update public.scoring_settings set dance_card_version = p_version where league_id = p_league_id;
  end if;
  return v_given;
end;
$$;
