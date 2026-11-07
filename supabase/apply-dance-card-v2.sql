-- Dance Card v2 (docs/design/dance-card-v2/): a league can score Dance Card
-- on a season curve, k × (cumulative judges)^0.8, paying each week the
-- change in a couple's value. Every league stays on v1 until
-- set_dance_card_points switches it. Apply after apply-episode-rounds.sql and
-- apply-special-dance-label.sql, and before deploying the app that reads it.
-- apply-dance-card-v2-default.sql (new leagues start on v2) goes on only
-- after that deploy.
--
-- What changes:
--   1. scoring_settings.dance_card_version ('v1' | 'v2', existing leagues v1).
--   2. A guard: a v2 league's Anchor Week can't move once it has scores this
--      season, because every week's curve value starts from it.
--   3. weekly_manager_scores_archive: the rows a version switch replaced.
--   4. episode_publication_snapshot also carries the stored rows of later
--      weeks (laterWeeklyScores), so a correction's plan can rebuild them.
--   5. assert_special_dance_plan, which every publish and reveal commit
--      calls, refuses a plan below version 4 while any league is on v2, and
--      refuses a reveal while a v2 league already has a later week's scores.
--   6. commit_episode_publication_with_later_weeks: the unchanged
--      commit_episode_publication plus the v2 leagues' later weeks, in one
--      transaction.
--   7. dance_card_snapshot / set_dance_card_points: switch a league between
--      versions, or rebuild a v2 league in place, against a revision.

alter table public.scoring_settings
  add column if not exists dance_card_version text not null default 'v1'
  check (dance_card_version in ('v1', 'v2'));

create or replace function public.guard_dance_card_anchor()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.judges_score_starts_week is distinct from old.judges_score_starts_week
     and new.dance_card_version = 'v2'
     and exists (
       select 1 from public.weekly_manager_scores s
       join public.competition_weeks w on w.id = s.week_id
       where s.league_id = new.league_id
         and w.season_id = (select id from public.seasons where is_active limit 1)
     ) then
    raise exception 'This league scores Dance Card on the season curve, so its Anchor Week can''t move once weeks are scored.';
  end if;
  return new;
end;
$$;
drop trigger if exists scoring_settings_dance_card_anchor on public.scoring_settings;
create trigger scoring_settings_dance_card_anchor
  before update on public.scoring_settings
  for each row execute function public.guard_dance_card_anchor();
revoke all on function public.guard_dance_card_anchor() from public, anon, authenticated;

create table if not exists public.weekly_manager_scores_archive (
  migration_id uuid not null,
  archived_at timestamptz not null default now(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  week_id uuid not null references public.competition_weeks(id),
  roster_points numeric not null,
  prediction_points numeric not null,
  grand_finale_points numeric not null,
  total_points numeric not null,
  dance_card_version text not null,
  primary key (migration_id, league_id, manager_id, week_id)
);
alter table public.weekly_manager_scores_archive enable row level security;
revoke all on public.weekly_manager_scores_archive from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.episode_publication_snapshot(p_episode_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select payload || jsonb_build_object('_revision', md5(payload::text))
  from (select jsonb_build_object(
    'season', (select to_jsonb(s) from public.seasons s where is_active limit 1),
    'episodes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episodes where season_id = (select id from public.seasons where is_active limit 1)) r),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.competition_weeks where season_id = (select id from public.seasons where is_active limit 1)) r),
    'couples', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.couples where season_id = (select id from public.seasons where is_active limit 1)) r),
    'dances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.dance_scores where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'outcomes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_results where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'jeopardy', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_in_jeopardy_couples where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'leagues', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.leagues) r),
    'settings', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.scoring_settings) r),
    'rosters', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.roster_slots) r),
    'predictions', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.predictions where week_id = (select week_id from public.episodes where id = p_episode_id)) r),
    'lateUnlocks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.grand_finale_late_unlocks) r),
    'weeklyScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.weekly_manager_scores where week_id = (select week_id from public.episodes where id = p_episode_id)) r),
    'laterWeeklyScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (
      select s.* from public.weekly_manager_scores s
      join public.competition_weeks w on w.id = s.week_id
      where w.season_id = (select id from public.seasons where is_active limit 1)
        and w.week_number > (select cw.week_number from public.episodes e join public.competition_weeks cw on cw.id = e.week_id where e.id = p_episode_id)) r),
    'grandFinalePredictions', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.grand_finale_predictions) r),
    'draftOverrides', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_overrides where episode_id = p_episode_id) r),
    'draftDances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_dance_scores where episode_id = p_episode_id) r),
    'draftJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_judge_scores where draft_dance_score_id in (select id from public.draft_dance_scores where episode_id = p_episode_id)) r),
    'draftResults', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_results where episode_id = p_episode_id) r),
    'draftJeopardy', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id) r),
    'participants', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_participants where episode_id = p_episode_id) r),
    'teams', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_teams where episode_id = p_episode_id) r),
    'teamMembers', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_members where episode_id = p_episode_id) r),
    'teamMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'teamCoupleMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_couple_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'teamScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_scores where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'judges', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id) order by p.id), '[]'::jsonb) from public.people p where p.role = 'judge' and p.archived_at is null),
    'guestJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select episode_id, judge_id from public.episode_guest_judges where episode_id = p_episode_id) r)
  ) as payload) snapshot;
$function$;
revoke all on function public.episode_publication_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.episode_publication_snapshot(uuid) to service_role;

-- Publication plans carry laterDanceCard (possibly empty); reveal plans
-- don't, which is how a reveal is told apart for the order guard.
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
  if exists (select 1 from public.scoring_settings where dance_card_version = 'v2') then
    if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 4 then
      raise exception 'A league scores Dance Card on the season curve, which this version of the app cannot score. Reload the page and try again.';
    end if;
    if not (p_plan ? 'laterDanceCard') then
      select min(w.week_number) into v_later
      from public.weekly_manager_scores s
      join public.competition_weeks w on w.id = s.week_id
      join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version = 'v2'
      where w.season_id = (select id from public.seasons where is_active limit 1)
        and w.week_number > (select cw.week_number from public.episodes e join public.competition_weeks cw on cw.id = e.week_id where e.id = p_episode_id);
      if v_later is not null then
        raise exception 'Week % already has scores. Publish weeks in order.', v_later;
      end if;
    end if;
  end if;
end;
$function$;

-- A v2 league's later weeks after this week was installed: exactly every
-- stored later row of every v2 league, only Dance Card and the total moving,
-- each total matching the stored picks and the league's weights.
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
  join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version = 'v2'
  where abs(r.total_points - round(
    r.roster_points * st.judges_score_category_weight
    + s.prediction_points * st.eliminations_category_weight
    + s.grand_finale_points * st.bonus_picks_category_weight, 2)) <= 0.01;
  select count(*) into v_expected
  from public.weekly_manager_scores s
  join public.competition_weeks w on w.id = s.week_id and w.season_id = v_season and w.week_number > v_week
  join public.scoring_settings st on st.league_id = s.league_id and st.dance_card_version = 'v2';
  if v_matched <> v_given or v_given <> v_expected then
    raise exception 'Later weeks'' Dance Card is out of date (% of % rows). Refresh and try again.', v_matched, v_expected;
  end if;

  update public.weekly_manager_scores s
  set roster_points = r.roster_points, total_points = r.total_points, computed_at = now()
  from jsonb_to_recordset(v_rows) as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, total_points numeric)
  where s.league_id = r.league_id and s.manager_id = r.manager_id and s.week_id = r.week_id;
end;
$$;
revoke all on function public.apply_later_dance_card(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_later_dance_card(uuid, jsonb) to service_role;

-- What the app calls to publish: the live commit, then the later weeks, in
-- the caller's one transaction, so either everything lands or nothing does.
create or replace function public.commit_episode_publication_with_later_weeks(
  p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb
)
returns void language plpgsql set search_path = '' set lock_timeout = '5s'
as $$
begin
  perform public.commit_episode_publication(p_episode_id, p_published_by, p_snapshot, p_plan);
  perform public.apply_later_dance_card(p_episode_id, p_plan);
end;
$$;
revoke all on function public.commit_episode_publication_with_later_weeks(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_episode_publication_with_later_weeks(uuid, uuid, jsonb, jsonb) to service_role;

-- Everything a version switch or rebuild reads, with its own revision.
create or replace function public.dance_card_snapshot()
returns jsonb language sql stable set search_path = ''
as $$
  select payload || jsonb_build_object('_revision', md5(payload::text))
  from (select jsonb_build_object(
    'season', (select to_jsonb(s) from public.seasons s where is_active limit 1),
    'episodes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episodes where season_id = (select id from public.seasons where is_active limit 1)) r),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.competition_weeks where season_id = (select id from public.seasons where is_active limit 1)) r),
    'couples', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.couples where season_id = (select id from public.seasons where is_active limit 1)) r),
    'dances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.dance_scores where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'outcomes', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_results where episode_id in (select id from public.episodes where season_id = (select id from public.seasons where is_active limit 1))) r),
    'leagues', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.leagues) r),
    'settings', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.scoring_settings) r),
    'rosters', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.roster_slots) r),
    'weeklyScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (
      select s.* from public.weekly_manager_scores s
      join public.competition_weeks w on w.id = s.week_id
      where w.season_id = (select id from public.seasons where is_active limit 1)) r)
  ) as payload) snapshot;
$$;
revoke all on function public.dance_card_snapshot() from public, anon, authenticated;
grant execute on function public.dance_card_snapshot() to service_role;

-- Rewrites one league's Dance Card for the whole active season. With
-- p_version, switches the league (archiving what it replaces under
-- p_migration_id); without, rebuilds an already-v2 league in place.
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
    if not exists (select 1 from public.scoring_settings where league_id = p_league_id and dance_card_version = 'v2') then
      raise exception 'Only a league already on v2 can be rebuilt in place';
    end if;
  else
    if p_version not in ('v1', 'v2') then raise exception 'Unknown Dance Card version %', p_version; end if;
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
revoke all on function public.set_dance_card_points(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_dance_card_points(uuid, uuid, text, text, uuid, jsonb) to service_role;
