-- Team dances as their own entity. A team (episode_teams) has members, a song
-- and four judge marks entered once (episode_team_marks). Posting the team
-- writes one live dance_scores row per eligible member, tagged team_id, so
-- every reader keeps summing "a couple's rows in an episode" and Dance Card /
-- the night total combine the couple's own dance with the team dance.
-- Drafts never hold team rows: a couple posts its own dances on its own, and
-- the team posts, un-posts or re-posts on its own.
--
-- Supersedes apply-team-dances.sql. Additive and re-runnable. Apply only with
-- Kylie's OK (preview and production share one database), after
-- apply-audit-security.sql, and BEFORE deploying code that selects
-- dance_scores.team_id. The app detects the column and falls back to the
-- slot-2 inference until then.
begin;

insert into public.dance_styles (name, category)
select 'Freestyle', 'show'
where not exists (select 1 from public.dance_styles where lower(name) = 'freestyle');

create table if not exists public.episode_teams (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  song_title text,
  song_source text,
  dance_style_id uuid not null references public.dance_styles(id),
  captain_couple_id uuid references public.couples(id) on delete set null,
  -- Dances with the team but is never scored and never on a roster.
  host_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, name),
  unique (id, episode_id)
);
alter table public.episode_teams add column if not exists posted_at timestamptz;
alter table public.episode_teams add column if not exists posted_by uuid references public.profiles(id) on delete set null;
create index if not exists idx_episode_teams_episode on public.episode_teams(episode_id);

-- episode_id is repeated so "one team per couple per night" is a real constraint.
create table if not exists public.episode_team_members (
  team_id uuid not null,
  episode_id uuid not null,
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, couple_id),
  unique (episode_id, couple_id),
  foreign key (team_id, episode_id) references public.episode_teams(id, episode_id) on delete cascade
);
create index if not exists idx_episode_team_members_episode on public.episode_team_members(episode_id);

-- The team's marks, entered once. Draft until the team is posted; the live
-- copies are the team-tagged dance_scores rows. Partial sets are kept so
-- "3 of 4" survives a reload; posting needs all four.
create table if not exists public.episode_team_marks (
  team_id uuid not null references public.episode_teams(id) on delete cascade,
  judge_id uuid not null references public.people(id),
  score numeric not null check (score between 0 and 10),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (team_id, judge_id)
);

-- Provenance on live rows only: a couple's row that is a team's score. The
-- default FK (restrict) means a posted team cannot be deleted; un-post first.
alter table public.dance_scores add column if not exists team_id uuid references public.episode_teams(id);
create unique index if not exists uq_dance_scores_team_member
  on public.dance_scores(team_id, couple_id) where team_id is not null;

alter table public.episode_teams enable row level security;
alter table public.episode_team_members enable row level security;
alter table public.episode_team_marks enable row level security;
grant select on public.episode_teams, public.episode_team_members to authenticated;
grant select on public.episode_teams to anon;
grant all on public.episode_teams, public.episode_team_members, public.episode_team_marks to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'episode_teams'
                 and policyname = 'episode teams are viewable by all authenticated users') then
    create policy "episode teams are viewable by all authenticated users"
      on public.episode_teams for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'episode_teams'
                 and policyname = 'guests see teams of published episodes only') then
    create policy "guests see teams of published episodes only"
      on public.episode_teams for select to anon
      using (exists (select 1 from public.episodes e where e.id = episode_teams.episode_id and e.results_published_at is not null));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'episode_team_members'
                 and policyname = 'episode team members are viewable by all authenticated users') then
    create policy "episode team members are viewable by all authenticated users"
      on public.episode_team_members for select to authenticated using (true);
  end if;
end $$;

-- Marks no longer fan out into members' drafts.
drop function if exists public.apply_team_dance(uuid, uuid, uuid, jsonb, uuid[]);

create or replace function public.team_song_key(p_song text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(p_song, '')));
$$;
revoke all on function public.team_song_key(text) from public, anon, authenticated;
grant execute on function public.team_song_key(text) to service_role;

-- A couple's OWN dances as an order-independent value (team rows belong to
-- the team). The draft and live copies must agree for a posted couple before
-- the week can be finished.
create or replace function public.episode_couple_dance_signature(p_episode_id uuid, p_couple_id uuid, p_draft boolean)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(sig order by sig::text), '[]'::jsonb) from (
    select jsonb_build_array(d.dance_style_id, coalesce(d.song_title, ''),
      (select coalesce(jsonb_agg(jsonb_build_array(j.judge_id, j.score) order by j.judge_id), '[]'::jsonb)
       from public.draft_judge_scores j where j.draft_dance_score_id = d.id)) as sig
    from public.draft_dance_scores d where p_draft and d.episode_id = p_episode_id and d.couple_id = p_couple_id
    union all
    select jsonb_build_array(d.dance_style_id, coalesce(d.song_title, ''),
      (select coalesce(jsonb_agg(jsonb_build_array(j.judge_id, j.score) order by j.judge_id), '[]'::jsonb)
       from public.judge_scores j where j.dance_score_id = d.id)) as sig
    from public.dance_scores d where not p_draft and d.episode_id = p_episode_id and d.couple_id = p_couple_id and d.team_id is null
  ) s;
$$;
revoke all on function public.episode_couple_dance_signature(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.episode_couple_dance_signature(uuid, uuid, boolean) to service_role;

-- Who the team's score applies to: on the team, in tonight's cast, not
-- withdrawn, Did Not Dance, or eliminated before this week. Evaluated each
-- time the team is posted or the week is finished.
create or replace function public.team_eligible_members(p_episode_id uuid, p_team_id uuid)
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select c.id
  from public.episode_team_members tm
  join public.couples c on c.id = tm.couple_id
  join public.episodes e on e.id = p_episode_id
  left join public.competition_weeks w on w.id = e.week_id
  left join public.draft_episode_results r on r.episode_id = e.id and r.couple_id = c.id
  where tm.team_id = p_team_id and tm.episode_id = p_episode_id
    and coalesce(r.outcome, 'safe') not in ('withdrawn', 'bye')
    and c.status <> 'withdrawn'
    and not (c.status = 'eliminated' and (c.elimination_week is null or w.week_number is null or c.elimination_week < w.week_number))
    and (not exists (select 1 from public.episode_participants p where p.episode_id = e.id)
         or exists (select 1 from public.episode_participants p where p.episode_id = e.id and p.couple_id = c.id))
  order by c.id;
$$;
revoke all on function public.team_eligible_members(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_eligible_members(uuid, uuid) to service_role;

-- One tagged live row per eligible member from the team's four marks: inserted
-- or rewritten in place (a re-scored team), rows of members no longer eligible
-- removed. Shared by the team post and by Finish Week.
create or replace function public.materialize_team_scores(p_episode_id uuid, p_team_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare team public.episode_teams; v_total numeric; v_count int; v_member uuid; v_live_id uuid;
begin
  select * into strict team from public.episode_teams where id = p_team_id and episode_id = p_episode_id;
  select coalesce(sum(score), 0), count(*) into v_total, v_count from public.episode_team_marks where team_id = team.id;
  if v_count <> 4 then raise exception 'Team % has % of four marks. Score it or remove it first.', team.name, v_count; end if;
  for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
    insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, team_id)
    values (p_episode_id, v_member, team.dance_style_id, team.song_title, v_total, v_total / 4 * 3, team.id)
    on conflict (team_id, couple_id) where team_id is not null do update
      set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
          total_score = excluded.total_score, scaled_score = excluded.scaled_score
    returning id into v_live_id;
    delete from public.judge_scores where dance_score_id = v_live_id;
    insert into public.judge_scores (dance_score_id, judge_id, score)
    select v_live_id, judge_id, score from public.episode_team_marks where team_id = team.id;
  end loop;
  delete from public.dance_scores d where d.team_id = team.id
    and not exists (select 1 from public.team_eligible_members(p_episode_id, team.id) m where m = d.couple_id);
end;
$$;
revoke all on function public.materialize_team_scores(uuid, uuid) from public, anon, authenticated;
grant execute on function public.materialize_team_scores(uuid, uuid) to service_role;

-- Replaces an episode's team setup in one transaction. Teams keep their ids
-- when the payload carries them; teams missing from the payload are removed.
-- A posted team cannot be removed or have its members changed: un-post first.
create or replace function public.save_episode_teams(p_episode_id uuid, p_actor_id uuid, p_teams jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; team jsonb; existing public.episode_teams; v_freestyle uuid; v_style uuid;
  v_name text; v_song text; v_captain uuid; v_members uuid[]; v_old_members uuid[];
  v_team_id uuid; v_names text[] := '{}'; v_all_members uuid[] := '{}'; v_team_ids uuid[] := '{}'; i int := 0;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Only a site admin can set up teams';
  end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_teams is null or jsonb_typeof(p_teams) <> 'array' then raise exception 'Teams must be a list'; end if;
  select id into v_freestyle from public.dance_styles where lower(name) = 'freestyle' order by created_at limit 1;

  for team in select * from jsonb_array_elements(p_teams) loop
    v_name := btrim(coalesce(team->>'name', ''));
    if v_name = '' then raise exception 'Every team needs a name'; end if;
    if lower(v_name) = any(v_names) then raise exception 'Two teams are both called "%"', v_name; end if;
    v_names := v_names || lower(v_name);
    select coalesce(array_agg(distinct (m #>> '{}')::uuid), '{}'::uuid[]) into v_members from jsonb_array_elements(coalesce(team->'memberCoupleIds', '[]'::jsonb)) m;
    if cardinality(v_members) < 2 then raise exception 'Team "%" needs at least two couples', v_name; end if;
    if v_members && v_all_members then raise exception 'A couple can be on only one team per night'; end if;
    v_all_members := v_all_members || v_members;
    if exists (select 1 from unnest(v_members) m(id) where not exists (select 1 from public.couples c where c.id = m.id and c.season_id = ep.season_id)) then
      raise exception 'Team "%" includes a couple who is not in this season', v_name;
    end if;
    v_captain := nullif(team->>'captainCoupleId', '')::uuid;
    if v_captain is not null and not (v_captain = any(v_members)) then raise exception 'The captain of "%" must be on the team', v_name; end if;
    v_style := coalesce(nullif(team->>'danceStyleId', '')::uuid, v_freestyle);
    if v_style is null or not exists (select 1 from public.dance_styles where id = v_style) then raise exception 'Pick a dance style for "%"', v_name; end if;
    if team->>'id' is not null and not exists (select 1 from public.episode_teams where id = (team->>'id')::uuid and episode_id = ep.id) then
      raise exception 'Team "%" is no longer on this episode. Reload and try again.', v_name;
    end if;
  end loop;

  for existing in
    select * from public.episode_teams t where t.episode_id = ep.id
      and not exists (select 1 from jsonb_array_elements(p_teams) x where x->>'id' = t.id::text)
  loop
    if existing.posted_at is not null then raise exception 'Un-post team "%" before removing it', existing.name; end if;
    delete from public.episode_teams where id = existing.id;
  end loop;

  -- Existing teams shed members first, so a couple moving between two teams
  -- in one save never trips the one-team-per-couple rule.
  for team in select * from jsonb_array_elements(p_teams) loop
    continue when team->>'id' is null;
    select * into existing from public.episode_teams where id = (team->>'id')::uuid and episode_id = ep.id;
    select coalesce(array_agg(distinct (m #>> '{}')::uuid), '{}'::uuid[]) into v_members from jsonb_array_elements(coalesce(team->'memberCoupleIds', '[]'::jsonb)) m;
    select coalesce(array_agg(couple_id order by couple_id), '{}'::uuid[]) into v_old_members from public.episode_team_members where team_id = existing.id;
    if existing.posted_at is not null and (select coalesce(array_agg(m order by m), '{}'::uuid[]) from unnest(v_members) m) is distinct from v_old_members then
      raise exception 'Un-post team "%" before changing its members', existing.name;
    end if;
    delete from public.episode_team_members where team_id = existing.id and not (couple_id = any(v_members));
  end loop;

  for team in select * from jsonb_array_elements(p_teams) loop
    i := i + 1;
    v_name := btrim(team->>'name');
    select coalesce(array_agg(distinct (m #>> '{}')::uuid), '{}'::uuid[]) into v_members from jsonb_array_elements(coalesce(team->'memberCoupleIds', '[]'::jsonb)) m;
    v_captain := nullif(team->>'captainCoupleId', '')::uuid;
    v_style := coalesce(nullif(team->>'danceStyleId', '')::uuid, v_freestyle);
    v_song := nullif(btrim(coalesce(team->>'songTitle', '')), '');
    existing := null;
    if team->>'id' is not null then
      select * into existing from public.episode_teams where id = (team->>'id')::uuid and episode_id = ep.id;
    end if;
    if existing.id is null then
      insert into public.episode_teams (episode_id, name, song_title, song_source, dance_style_id, captain_couple_id, host_name, sort_order)
      values (ep.id, v_name, v_song, nullif(btrim(coalesce(team->>'songSource', '')), ''), v_style, v_captain,
              nullif(btrim(coalesce(team->>'hostName', '')), ''), coalesce((team->>'sortOrder')::int, i))
      returning id into v_team_id;
    else
      v_team_id := existing.id;
      update public.episode_teams set name = v_name, song_title = v_song, song_source = nullif(btrim(coalesce(team->>'songSource', '')), ''),
        dance_style_id = v_style, captain_couple_id = v_captain, host_name = nullif(btrim(coalesce(team->>'hostName', '')), ''),
        sort_order = coalesce((team->>'sortOrder')::int, i), updated_at = now()
      where id = existing.id and (name, song_title, song_source, dance_style_id, captain_couple_id, host_name, sort_order) is distinct from
        (v_name, v_song, nullif(btrim(coalesce(team->>'songSource', '')), ''), v_style, v_captain, nullif(btrim(coalesce(team->>'hostName', '')), ''), coalesce((team->>'sortOrder')::int, i));
      -- A posted team's live rows follow a renamed song or style.
      if existing.posted_at is not null then
        update public.dance_scores set dance_style_id = v_style, song_title = v_song where team_id = existing.id;
      end if;
    end if;
    v_team_ids := v_team_ids || v_team_id;
    insert into public.episode_team_members (team_id, episode_id, couple_id)
    select v_team_id, ep.id, m from unnest(v_members) m on conflict do nothing;
  end loop;
  return jsonb_build_object('teamIds', to_jsonb(v_team_ids));
end;
$$;
revoke all on function public.save_episode_teams(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_teams(uuid, uuid, jsonb) to service_role;

-- Propose tier. Saves whatever marks are in; posting needs all four. A posted
-- team keeps its live rows until it is re-posted.
create or replace function public.save_team_marks(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_marks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; team public.episode_teams; v_panel uuid[]; mark jsonb;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into strict ep from public.episodes where id = p_episode_id;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id;
  if team.id is null then raise exception 'That team is no longer on this episode'; end if;
  select coalesce(array_agg(j.id), '{}'::uuid[]) into v_panel from (
    select id from public.people where role = 'judge' and archived_at is null
    union
    select judge_id from public.episode_guest_judges where episode_id = ep.id
  ) j;
  if cardinality(v_panel) <> 4 then
    raise exception 'Team Dances need exactly four judges and this night has %. Set the guest judge on Schedule first.', cardinality(v_panel);
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > 4 then raise exception 'Marks must be a list of at most four'; end if;
  for mark in select * from jsonb_array_elements(p_marks) loop
    if mark->>'score' is null or (mark->>'score')::numeric not between 0 and 10 then raise exception 'Judge scores must be between 0 and 10'; end if;
    if not ((mark->>'judgeId')::uuid = any(v_panel)) then raise exception 'Marks must be for this night''s judges'; end if;
  end loop;
  delete from public.episode_team_marks where team_id = team.id;
  insert into public.episode_team_marks (team_id, judge_id, score, updated_by)
  select team.id, (m->>'judgeId')::uuid, (m->>'score')::numeric, p_actor_id from jsonb_array_elements(p_marks) m;
  update public.episode_teams set updated_at = now() where id = team.id;
  insert into public.draft_episode_overrides (episode_id, updated_by, guest_judge_name, judges_save_available)
  values (ep.id, p_actor_id, ep.guest_judge_name, ep.judges_save_available)
  on conflict (episode_id) do update set updated_at = now(), updated_by = p_actor_id;
end;
$$;
revoke all on function public.save_team_marks(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_team_marks(uuid, uuid, uuid, jsonb) to service_role;

-- Admin. Posts (or un-posts, or re-posts in place) a team's score for every
-- eligible member, independent of whether their own dance is posted, then
-- installs the week's recomputed judges points from the plan.
create or replace function public.commit_team_reveal(
  p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean
) returns void language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare ep public.episodes;
begin
  perform 1 from public.episodes where id = p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks in share row exclusive mode;
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id = p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if not exists (select 1 from public.episode_teams where id = p_team_id and episode_id = ep.id) then raise exception 'That team is no longer on this episode'; end if;
  if p_undo then
    delete from public.dance_scores where team_id = p_team_id;
    update public.episode_teams set posted_at = null, posted_by = null where id = p_team_id;
  else
    perform public.materialize_team_scores(ep.id, p_team_id);
    update public.episode_teams set posted_at = now(), posted_by = p_actor_id where id = p_team_id;
  end if;
  if ep.week_id is not null then
    if exists (select 1 from jsonb_array_elements(p_plan->'weeklyScores') r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
    delete from public.weekly_manager_scores where week_id = ep.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as r(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;
end;
$$;
revoke all on function public.commit_team_reveal(uuid, uuid, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.commit_team_reveal(uuid, uuid, uuid, jsonb, jsonb, boolean) to service_role;

-- The snapshot now carries the teams, their members and marks, this night's
-- cast list, and team_id on every dance row, so plans and the revision hash
-- cover a marks edit between planning and committing.
create or replace function public.episode_publication_snapshot(p_episode_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
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
    'grandFinalePredictions', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.grand_finale_predictions) r),
    'draftOverrides', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_overrides where episode_id = p_episode_id) r),
    'draftDances', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_dance_scores where episode_id = p_episode_id) r),
    'draftJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_judge_scores where draft_dance_score_id in (select id from public.draft_dance_scores where episode_id = p_episode_id)) r),
    'draftResults', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_results where episode_id = p_episode_id) r),
    'draftJeopardy', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id) r),
    'draftMoments', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.draft_episode_custom_moments where episode_id = p_episode_id) r),
    'participants', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_participants where episode_id = p_episode_id) r),
    'teams', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_teams where episode_id = p_episode_id) r),
    'teamMembers', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_members where episode_id = p_episode_id) r),
    'teamMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r)
  ) as payload) snapshot;
$$;
revoke all on function public.episode_publication_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.episode_publication_snapshot(uuid) to service_role;

-- Posting a couple copies only their own draft dances; "already posted" and
-- the undo look only at their own live rows, so a team's row for that couple
-- is never touched here.
create or replace function public.commit_episode_reveal(
  p_episode_id uuid,p_couple_id uuid,p_actor_id uuid,p_snapshot jsonb,p_plan jsonb,p_undo boolean
) returns void language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare ep public.episodes; dance record; live_id uuid;
begin
  perform 1 from public.episodes where id=p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks in share row exclusive mode;
  if not exists(select 1 from public.profiles where id=p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id=p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if p_undo then
    delete from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id and team_id is null;
  else
    if exists(select 1 from public.dance_scores where episode_id=ep.id and couple_id=p_couple_id and team_id is null) then raise exception 'This couple is already posted'; end if;
    if not exists(select 1 from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id) then raise exception 'No saved scores for this couple'; end if;
    for dance in select * from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id loop
      if not exists(select 1 from public.draft_judge_scores where draft_dance_score_id=dance.id) then raise exception 'Complete the judge scores before posting'; end if;
      insert into public.dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
      select ep.id,p_couple_id,dance.dance_style_id,dance.song_title,sum(score),avg(score)*3
      from public.draft_judge_scores where draft_dance_score_id=dance.id returning id into live_id;
      insert into public.judge_scores(dance_score_id,judge_id,score)
      select live_id,judge_id,score from public.draft_judge_scores where draft_dance_score_id=dance.id;
    end loop;
  end if;
  if ep.week_id is not null then
    if exists(select 1 from jsonb_array_elements(p_plan->'weeklyScores') r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
    delete from public.weekly_manager_scores where week_id=ep.week_id;
    insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)
    select league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as r(league_id uuid,manager_id uuid,week_id uuid,roster_points numeric,prediction_points numeric,grand_finale_points numeric,total_points numeric);
  end if;
end;
$$;
revoke all on function public.commit_episode_reveal(uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.commit_episode_reveal(uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;

-- A correction draft holds the couples' own dances; team rows are corrected
-- through the team's marks and re-materialized on Publish Results.
create or replace function public.seed_episode_correction(p_episode_id uuid, p_started_by uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; live record; draft_id uuid; token uuid;
begin
  if not exists(select 1 from public.profiles where id = p_started_by and is_super_admin) then raise exception 'Only a site admin can begin a correction'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if ep.results_published_at is null then raise exception 'Only published episodes can be corrected'; end if;
  select correction_token into token from public.draft_episode_overrides where episode_id = ep.id and correction_base_published_at = ep.results_published_at;
  if token is not null then return token; end if;
  delete from public.draft_episode_overrides where episode_id = ep.id;
  delete from public.draft_dance_scores where episode_id = ep.id;
  delete from public.draft_episode_results where episode_id = ep.id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = ep.id;
  delete from public.draft_episode_custom_moments where episode_id = ep.id;
  delete from public.draft_couple_releases where episode_id = ep.id;
  token := gen_random_uuid();
  insert into public.draft_episode_overrides(episode_id,guest_judge_name,judges_save_available,updated_by,correction_token,correction_base_published_at)
  values(ep.id,ep.guest_judge_name,ep.judges_save_available,p_started_by,token,ep.results_published_at);
  for live in select * from public.dance_scores where episode_id = ep.id and team_id is null loop
    insert into public.draft_dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
    values(ep.id,live.couple_id,live.dance_style_id,live.song_title,live.total_score,live.scaled_score) returning id into draft_id;
    insert into public.draft_judge_scores(draft_dance_score_id,judge_id,score) select draft_id,judge_id,score from public.judge_scores where dance_score_id = live.id;
  end loop;
  insert into public.draft_episode_results(episode_id,couple_id,outcome,saved_by_judges,had_immunity,bonus_points,bonus_note)
  select episode_id,couple_id,outcome,saved_by_judges,had_immunity,bonus_points,bonus_note from public.episode_results where episode_id = ep.id;
  insert into public.draft_episode_in_jeopardy_couples(episode_id,couple_id) select episode_id,couple_id from public.episode_in_jeopardy_couples where episode_id = ep.id;
  insert into public.draft_episode_custom_moments(episode_id,couple_id,label) select episode_id,couple_id,label from public.episode_custom_moments where episode_id = ep.id;
  return token;
end;
$$;
revoke all on function public.seed_episode_correction(uuid,uuid) from public, anon, authenticated;
grant execute on function public.seed_episode_correction(uuid,uuid) to service_role;

-- save_episode_draft, except that while the episode is unpublished a posted
-- couple's draft dances are left exactly as they are instead of re-copied from
-- the live rows. Their outcome and In Jeopardy still save. An entry whose
-- dances differ from the posted couple's draft is reported as skipped.
create or replace function public.save_episode_draft_checked(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; actor public.profiles; entry jsonb; dance jsonb; js jsonb;
  couple uuid; draft_id uuid; total numeric; count_scores int; token uuid; base timestamptz;
  v_acknowledged uuid[] := '{}'; v_skipped uuid[] := '{}'; v_incoming jsonb;
begin
  select * into strict actor from public.profiles where id = (p_input->>'updatedBy')::uuid;
  if not (actor.is_super_admin or actor.can_propose_results) then raise exception 'Not authorized to enter results'; end if;
  select * into strict ep from public.episodes where id = (p_input->>'episodeId')::uuid for update;
  select correction_token, correction_base_published_at into token, base from public.draft_episode_overrides where episode_id = ep.id;
  if ep.results_published_at is not null then
    if not actor.is_super_admin then raise exception 'Only a site admin can correct published results'; end if;
    if token is null or token is distinct from (p_input->>'correctionToken')::uuid or base is distinct from ep.results_published_at then
      raise exception 'This episode was published. Reload it to begin an explicit correction.';
    end if;
  elsif p_input->>'correctionToken' is not null then raise exception 'The correction session changed. Reload this episode.';
  end if;
  insert into public.draft_episode_overrides (episode_id, guest_judge_name, judges_save_available, updated_at, updated_by)
  values (ep.id, p_input->>'guestJudgeName', coalesce((p_input->>'judgesSaveAvailable')::boolean, false), now(), actor.id)
  on conflict (episode_id) do update set guest_judge_name = excluded.guest_judge_name, judges_save_available = excluded.judges_save_available, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  for entry in select * from jsonb_array_elements(p_input->'entries') loop
    couple := (entry->>'coupleId')::uuid;
    if not exists (select 1 from public.couples where id = couple and season_id = ep.season_id) then raise exception 'Couple is not in this season'; end if;
    if ep.results_published_at is null and exists (select 1 from public.dance_scores where episode_id = ep.id and couple_id = couple and team_id is null) then
      select coalesce(jsonb_agg(sig order by sig::text), '[]'::jsonb) into v_incoming from (
        select jsonb_build_array((d->>'danceStyleId')::uuid, coalesce(d->>'songTitle', ''),
          (select coalesce(jsonb_agg(jsonb_build_array((j->>'judgeId')::uuid, (j->>'score')::numeric) order by (j->>'judgeId')::uuid), '[]'::jsonb)
           from jsonb_array_elements(d->'judgeScores') j)) as sig
        from jsonb_array_elements(coalesce(entry->'dances', '[]'::jsonb)) d
      ) s;
      if v_incoming is distinct from public.episode_couple_dance_signature(ep.id, couple, true) then
        v_skipped := v_skipped || couple;
      else
        v_acknowledged := v_acknowledged || couple;
      end if;
    else
      delete from public.draft_dance_scores where episode_id = ep.id and couple_id = couple;
      for dance in select * from jsonb_array_elements(entry->'dances') loop
        total := 0; count_scores := 0;
        for js in select * from jsonb_array_elements(dance->'judgeScores') loop
          if (js->>'score')::numeric not between 0 and 10 then raise exception 'Judge scores must be between 0 and 10'; end if;
          total := total + (js->>'score')::numeric; count_scores := count_scores + 1;
        end loop;
        insert into public.draft_dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
        values (ep.id, couple, (dance->>'danceStyleId')::uuid, dance->>'songTitle', total, case when count_scores = 0 then 0 else total / count_scores * 3 end) returning id into draft_id;
        insert into public.draft_judge_scores (draft_dance_score_id, judge_id, score)
        select draft_id, (j->>'judgeId')::uuid, (j->>'score')::numeric from jsonb_array_elements(dance->'judgeScores') j;
      end loop;
      v_acknowledged := v_acknowledged || couple;
    end if;
    insert into public.draft_episode_results (episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note)
    values (ep.id, couple, entry->>'outcome', coalesce((entry->>'savedByJudges')::boolean, false), coalesce((entry->>'hadImmunity')::boolean, false), coalesce((entry->>'bonusPoints')::numeric, 0), entry->>'bonusNote')
    on conflict (episode_id, couple_id) do update set outcome = excluded.outcome, saved_by_judges = excluded.saved_by_judges, had_immunity = excluded.had_immunity, bonus_points = excluded.bonus_points, bonus_note = excluded.bonus_note;
    delete from public.draft_episode_in_jeopardy_couples where episode_id = ep.id and couple_id = couple;
    if entry->>'outcome' = 'safe' and (p_input->'inJeopardyCoupleIds') ? couple::text then
      insert into public.draft_episode_in_jeopardy_couples (episode_id, couple_id) values (ep.id, couple);
    end if;
  end loop;
  return jsonb_build_object('acknowledged', to_jsonb(v_acknowledged), 'skippedPosted', to_jsonb(v_skipped));
end;
$$;
revoke all on function public.save_episode_draft_checked(jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_draft_checked(jsonb) to service_role;

-- Finishing the week installs the couples' own drafts (keeping a posted
-- couple's live rows, which must agree with their draft), then materializes
-- every team from its marks: rows for members whose team was never posted,
-- and rewrites for posted ones. A team with members but fewer than four
-- marks stops publication by name.
create or replace function public.commit_episode_publication(
  p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb
)
returns void language plpgsql security invoker
set search_path = '' set lock_timeout = '5s'
as $$
declare
  v_episode public.episodes%rowtype;
  v_override public.draft_episode_overrides%rowtype;
  v_draft public.draft_dance_scores%rowtype;
  v_team public.episode_teams%rowtype;
  v_dance_id uuid;
  v_preserved uuid[];
  v_departed uuid[];
  v_future uuid[];
  v_couple uuid;
  v_celebrity text;
  v_marks int;
begin
  perform 1 from public.episodes where id=p_episode_id for update;
  lock table public.seasons, public.episodes, public.competition_weeks,
    public.couples, public.dance_scores, public.judge_scores,
    public.episode_results, public.episode_in_jeopardy_couples,
    public.leagues, public.scoring_settings, public.roster_slots,
    public.predictions, public.grand_finale_late_unlocks,
    public.grand_finale_predictions, public.draft_episode_overrides,
    public.draft_dance_scores, public.draft_judge_scores,
    public.draft_episode_results, public.draft_episode_in_jeopardy_couples,
    public.draft_episode_custom_moments, public.episode_participants,
    public.episode_custom_moments, public.draft_couple_releases,
    public.weekly_manager_scores, public.episode_teams, public.episode_team_members,
    public.episode_team_marks in share row exclusive mode;

  if not exists (select 1 from public.profiles where id = p_published_by and is_super_admin) then
    raise exception 'Not authorized to publish results';
  end if;
  if p_snapshot is null or p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(p_episode_id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  select * into strict v_episode from public.episodes where id = p_episode_id;
  select * into strict v_override from public.draft_episode_overrides where episode_id = p_episode_id;
  if v_episode.results_published_at is not null and (
    exists (select 1 from public.episode_results live where live.episode_id = p_episode_id
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id))
    or exists (select 1 from public.dance_scores live where live.episode_id = p_episode_id and live.team_id is null
      and not exists (select 1 from public.draft_dance_scores draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id)
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id and draft.outcome = 'bye'))
  ) then raise exception 'Incomplete correction draft. Reload the complete published episode before correcting it.'; end if;

  if not exists (select 1 from public.draft_episode_results where episode_id = p_episode_id) then
    raise exception 'No results to publish for this episode';
  end if;

  for v_team in select * from public.episode_teams where episode_id = p_episode_id loop
    select count(*) into v_marks from public.episode_team_marks where team_id = v_team.id;
    if v_marks <> 4 and exists (select 1 from public.episode_team_members where team_id = v_team.id) then
      raise exception 'Team % has % of four marks. Score it or remove it before finishing the week.', v_team.name, v_marks;
    end if;
  end loop;

  select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_preserved
  from public.dance_scores where episode_id = p_episode_id and team_id is null and v_episode.results_published_at is null;
  if cardinality(v_preserved) > 0 and exists (
    select 1 from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved))
  ) then raise exception 'Post every couple before publishing results'; end if;
  foreach v_couple in array v_preserved loop
    if public.episode_couple_dance_signature(p_episode_id, v_couple, true) is distinct from public.episode_couple_dance_signature(p_episode_id, v_couple, false) then
      select p.name into v_celebrity from public.couples c join public.people p on p.id = c.celebrity_id where c.id = v_couple;
      raise exception 'Posted scores for % differ from their draft (an edit arrived after they were posted). Un-Post and Publish them again before finishing the week.', coalesce(v_celebrity, 'a couple');
    end if;
  end loop;

  delete from public.dance_scores where episode_id = p_episode_id and team_id is null and not (couple_id = any(v_preserved));
  for v_draft in select * from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved)) loop
    insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
    select p_episode_id, v_draft.couple_id, v_draft.dance_style_id, v_draft.song_title,
      coalesce(sum(score), 0), coalesce(sum(score) * 3.0 / nullif(count(*), 0), 0)
    from public.draft_judge_scores where draft_dance_score_id = v_draft.id
    returning id into v_dance_id;
    insert into public.judge_scores (dance_score_id, judge_id, score)
    select v_dance_id, judge_id, score from public.draft_judge_scores where draft_dance_score_id = v_draft.id;
  end loop;

  for v_team in select * from public.episode_teams where episode_id = p_episode_id loop
    if exists (select 1 from public.episode_team_members where team_id = v_team.id) then
      perform public.materialize_team_scores(p_episode_id, v_team.id);
      update public.episode_teams set posted_at = coalesce(posted_at, now()), posted_by = coalesce(posted_by, p_published_by) where id = v_team.id;
    end if;
  end loop;

  delete from public.episode_results where episode_id = p_episode_id;
  insert into public.episode_results (episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note)
  select episode_id, couple_id, outcome, saved_by_judges, had_immunity, bonus_points, bonus_note
  from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.episode_in_jeopardy_couples where episode_id = p_episode_id;
  insert into public.episode_in_jeopardy_couples (episode_id, couple_id)
  select j.episode_id, j.couple_id from public.draft_episode_in_jeopardy_couples j
  where j.episode_id = p_episode_id and not exists (
    select 1 from public.draft_episode_results r where r.episode_id = p_episode_id and r.couple_id = j.couple_id and r.outcome = 'eliminated'
  );

  update public.couples c set status = u.status, elimination_week = u.elimination_week
  from jsonb_to_recordset(p_plan->'coupleUpdates') as u(id uuid, status text, elimination_week int)
  where c.id = u.id and c.season_id = v_episode.season_id;
  select coalesce(array_agg(couple_id), '{}'::uuid[]) into v_departed from public.draft_episode_results
  where episode_id = p_episode_id and outcome in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place');
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_future from jsonb_array_elements_text(p_plan->'futureEpisodeIds');
  delete from public.episode_participants where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_episode_results where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_dance_scores where episode_id = any(v_future) and couple_id = any(v_departed);
  delete from public.draft_episode_custom_moments where episode_id = any(v_future) and couple_id = any(v_departed);

  if v_episode.week_id is not null then
    if exists (select 1 from jsonb_to_recordset(p_plan->'weeklyScores') as s(week_id uuid) where week_id is distinct from v_episode.week_id) then
      raise exception 'Score rows must belong to this competition week';
    end if;
    delete from public.weekly_manager_scores where week_id = v_episode.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as s(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;
  delete from public.episode_custom_moments where episode_id = p_episode_id;
  insert into public.episode_custom_moments (episode_id, couple_id, label, created_by)
  select episode_id, couple_id, label, p_published_by from public.draft_episode_custom_moments where episode_id = p_episode_id;

  update public.episodes set status = 'completed', results_published_at = now(), results_published_by = p_published_by,
    guest_judge_name = v_override.guest_judge_name, judges_save_available = v_override.judges_save_available
  where id = p_episode_id;
  delete from public.draft_episode_overrides where episode_id = p_episode_id;
  delete from public.draft_dance_scores where episode_id = p_episode_id;
  delete from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.draft_episode_custom_moments where episode_id = p_episode_id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id;
  delete from public.draft_couple_releases where episode_id = p_episode_id;
end;
$$;
revoke all on function public.commit_episode_publication(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_episode_publication(uuid, uuid, jsonb, jsonb) to service_role;

commit;

-- Tell the API about the new tables and column without waiting for its cache to refresh.
notify pgrst, 'reload schema';
