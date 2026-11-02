-- Team Dances: persisted team setup per episode plus an atomic team-score
-- fan-out into members' drafts. Additive. Apply only with Kylie's OK in the
-- Supabase Dashboard SQL Editor: preview and production share one database.
-- The app runs without this script (Enter Results hides the Team Dances card
-- and points to manual second-slot entry). Re-running it is safe.
begin;

-- Data only: the default style for a team dance. dance_styles.name is unique
-- but case-sensitive, so the existence check is case-insensitive.
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

-- Same trust level as episode_round_types: readable by signed-in users,
-- written only through the service-role RPCs below.
alter table public.episode_teams enable row level security;
alter table public.episode_team_members enable row level security;
grant select on public.episode_teams, public.episode_team_members to authenticated;
grant all on public.episode_teams, public.episode_team_members to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'episode_teams'
                 and policyname = 'episode teams are viewable by all authenticated users') then
    create policy "episode teams are viewable by all authenticated users"
      on public.episode_teams for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'episode_team_members'
                 and policyname = 'episode team members are viewable by all authenticated users') then
    create policy "episode team members are viewable by all authenticated users"
      on public.episode_team_members for select to authenticated using (true);
  end if;
end $$;

-- The song half of a team dance's signature: case- and whitespace-insensitive,
-- so a team saved as "Zoo" adopts a slot already typed as "zoo ".
create or replace function public.team_song_key(p_song text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(p_song, '')));
$$;
revoke all on function public.team_song_key(text) from public, anon, authenticated;
grant execute on function public.team_song_key(text) to service_role;

-- A couple's dances as an order-independent value: style, song and every
-- judge's mark. The draft and live copies must agree for a posted couple
-- before the week can be finished.
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
    from public.dance_scores d where not p_draft and d.episode_id = p_episode_id and d.couple_id = p_couple_id
  ) s;
$$;
revoke all on function public.episode_couple_dance_signature(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.episode_couple_dance_signature(uuid, uuid, boolean) to service_role;

-- One set of four marks written into every eligible member's draft as that
-- couple's team dance. The team row is found by its signature (the team's
-- style and song), never by slot position. A couple with no team row yet
-- receives one only when they have exactly one other dance; anything else is
-- a collision for a person to resolve. Withdrawn, bye, already-eliminated and
-- non-performing members are skipped. A posted member's draft is still
-- written (so the mark is never lost) and reported, because their live rows
-- cannot change until a site admin un-posts and re-posts them.
create or replace function public.apply_team_dance(
  p_episode_id uuid, p_actor_id uuid, p_team_id uuid, p_marks jsonb, p_couple_ids uuid[] default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; team public.episode_teams; mark jsonb; member record;
  v_week int; v_panel uuid[]; v_mark_judges uuid[]; v_total numeric := 0;
  v_outcome text; v_restricted boolean; v_team_rows int; v_other_rows int; v_team_row uuid;
  v_applied uuid[] := '{}'; v_posted uuid[] := '{}'; v_skipped jsonb := '[]'::jsonb; v_collisions jsonb := '[]'::jsonb;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into strict ep from public.episodes where id = p_episode_id;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id;
  if team.id is null then raise exception 'That team is no longer on this episode'; end if;
  select week_number into v_week from public.competition_weeks where id = ep.week_id;

  select coalesce(array_agg(j.id order by j.id), '{}'::uuid[]) into v_panel from (
    select id from public.people where role = 'judge' and archived_at is null
    union
    select judge_id from public.episode_guest_judges where episode_id = ep.id
  ) j;
  if cardinality(v_panel) <> 4 then
    raise exception 'Team Dances need exactly four judges and this night has %. Set the guest judge on Schedule first.', cardinality(v_panel);
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) <> 4 then
    raise exception 'Enter all four judges'' marks before the team score is saved';
  end if;
  for mark in select * from jsonb_array_elements(p_marks) loop
    if mark->>'score' is null or (mark->>'score')::numeric not between 0 and 10 then
      raise exception 'Judge scores must be between 0 and 10';
    end if;
    v_total := v_total + (mark->>'score')::numeric;
  end loop;
  select array_agg((m->>'judgeId')::uuid order by (m->>'judgeId')::uuid) into v_mark_judges from jsonb_array_elements(p_marks) m;
  if v_mark_judges is distinct from v_panel then raise exception 'Marks must cover exactly this night''s four judges'; end if;

  v_restricted := exists (select 1 from public.episode_participants where episode_id = ep.id);
  for member in
    select c.id, c.status, c.elimination_week
    from public.episode_team_members tm join public.couples c on c.id = tm.couple_id
    where tm.team_id = team.id and (p_couple_ids is null or c.id = any(p_couple_ids))
    order by c.id
  loop
    select outcome into v_outcome from public.draft_episode_results where episode_id = ep.id and couple_id = member.id;
    if v_outcome in ('withdrawn', 'bye') or member.status = 'withdrawn' then
      v_skipped := v_skipped || jsonb_build_object('coupleId', member.id, 'reason', case when v_outcome = 'bye' then 'bye' else 'withdrawn' end);
      continue;
    end if;
    if member.status = 'eliminated' and (member.elimination_week is null or v_week is null or member.elimination_week < v_week) then
      v_skipped := v_skipped || jsonb_build_object('coupleId', member.id, 'reason', 'eliminated');
      continue;
    end if;
    if v_restricted and not exists (select 1 from public.episode_participants where episode_id = ep.id and couple_id = member.id) then
      v_skipped := v_skipped || jsonb_build_object('coupleId', member.id, 'reason', 'not_performing');
      continue;
    end if;

    select count(*) filter (where d.dance_style_id = team.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(team.song_title)),
           count(*) filter (where not (d.dance_style_id = team.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(team.song_title)))
      into v_team_rows, v_other_rows
    from public.draft_dance_scores d where d.episode_id = ep.id and d.couple_id = member.id;
    if v_team_rows > 1 or (v_team_rows = 0 and v_other_rows <> 1) then
      v_collisions := v_collisions || jsonb_build_object('coupleId', member.id, 'teamRows', v_team_rows, 'otherDances', v_other_rows);
      continue;
    end if;

    if v_team_rows = 0 then
      insert into public.draft_dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
      values (ep.id, member.id, team.dance_style_id, team.song_title, v_total, v_total / 4 * 3) returning id into v_team_row;
    else
      select d.id into v_team_row from public.draft_dance_scores d
      where d.episode_id = ep.id and d.couple_id = member.id
        and d.dance_style_id = team.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(team.song_title);
      -- An adopted slot keeps its id and takes the team's exact song spelling.
      update public.draft_dance_scores set total_score = v_total, scaled_score = v_total / 4 * 3, song_title = team.song_title where id = v_team_row;
      delete from public.draft_judge_scores where draft_dance_score_id = v_team_row;
    end if;
    insert into public.draft_judge_scores (draft_dance_score_id, judge_id, score)
    select v_team_row, (m->>'judgeId')::uuid, (m->>'score')::numeric from jsonb_array_elements(p_marks) m;
    insert into public.draft_episode_results (episode_id, couple_id, outcome) values (ep.id, member.id, 'safe')
    on conflict (episode_id, couple_id) do nothing;

    if ep.results_published_at is null and exists (select 1 from public.dance_scores where episode_id = ep.id and couple_id = member.id) then
      v_posted := v_posted || member.id;
    end if;
    v_applied := v_applied || member.id;
  end loop;

  insert into public.draft_episode_overrides (episode_id, updated_by, guest_judge_name, judges_save_available)
  values (ep.id, p_actor_id, ep.guest_judge_name, ep.judges_save_available)
  on conflict (episode_id) do update set updated_at = now(), updated_by = p_actor_id;
  return jsonb_build_object('applied', to_jsonb(v_applied), 'posted', to_jsonb(v_posted), 'skipped', v_skipped, 'collisions', v_collisions);
end;
$$;
revoke all on function public.apply_team_dance(uuid, uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_team_dance(uuid, uuid, uuid, jsonb, uuid[]) to service_role;

-- Replaces an episode's team setup in one transaction. Teams keep their ids
-- when the payload carries them; teams missing from the payload are removed.
-- Edits propagate into the current draft: a removed member loses the team
-- dance, a renamed song or style follows the team rows, and a member added to
-- a team that already has marks receives them (through apply_team_dance, so
-- the same eligibility, collision and posted rules hold).
create or replace function public.save_episode_teams(p_episode_id uuid, p_actor_id uuid, p_teams jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; team jsonb; existing public.episode_teams; v_freestyle uuid; v_style uuid;
  v_name text; v_song text; v_captain uuid; v_members uuid[]; v_old_members uuid[]; v_kept uuid[]; v_added uuid[];
  v_team_id uuid; v_names text[] := '{}'; v_all_members uuid[] := '{}'; v_team_ids uuid[] := '{}';
  v_draft_open boolean; v_touched boolean := false; v_marks jsonb; v_result jsonb; v_deleted uuid[];
  v_posted uuid[] := '{}'; v_collisions jsonb := '[]'::jsonb; i int := 0;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Only a site admin can set up teams';
  end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_teams is null or jsonb_typeof(p_teams) <> 'array' then raise exception 'Teams must be a list'; end if;
  select id into v_freestyle from public.dance_styles where lower(name) = 'freestyle' order by created_at limit 1;
  -- Draft rows are only touched while the episode's draft is open: unpublished,
  -- or a published episode with a live correction session.
  v_draft_open := exists (
    select 1 from public.draft_episode_overrides o where o.episode_id = ep.id
      and (ep.results_published_at is null or (o.correction_token is not null and o.correction_base_published_at = ep.results_published_at))
  );

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

  -- Teams dropped from the list take their team dance out of members' drafts.
  for existing in
    select * from public.episode_teams t where t.episode_id = ep.id
      and not exists (select 1 from jsonb_array_elements(p_teams) x where x->>'id' = t.id::text)
  loop
    if v_draft_open then
      with removed as (
        delete from public.draft_dance_scores d
        where d.episode_id = ep.id and d.dance_style_id = existing.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(existing.song_title)
          and d.couple_id in (select couple_id from public.episode_team_members where team_id = existing.id)
        returning d.couple_id
      ) select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_deleted from removed;
      if cardinality(v_deleted) > 0 then v_touched := true; end if;
      select v_posted || coalesce(array_agg(couple_id), '{}'::uuid[]) into v_posted from public.dance_scores
      where ep.results_published_at is null and episode_id = ep.id and couple_id = any(v_deleted);
    end if;
    delete from public.episode_teams where id = existing.id;
  end loop;

  -- Existing teams first shed members and follow renames, so a couple moving
  -- between two teams in one save never trips the one-team-per-couple rule.
  for team in select * from jsonb_array_elements(p_teams) loop
    continue when team->>'id' is null;
    select * into existing from public.episode_teams where id = (team->>'id')::uuid and episode_id = ep.id;
    select coalesce(array_agg(distinct (m #>> '{}')::uuid), '{}'::uuid[]) into v_members from jsonb_array_elements(coalesce(team->'memberCoupleIds', '[]'::jsonb)) m;
    v_style := coalesce(nullif(team->>'danceStyleId', '')::uuid, v_freestyle);
    v_song := nullif(btrim(coalesce(team->>'songTitle', '')), '');
    select coalesce(array_agg(couple_id), '{}'::uuid[]) into v_old_members from public.episode_team_members where team_id = existing.id;
    select coalesce(array_agg(m), '{}'::uuid[]) into v_kept from unnest(v_old_members) m where m = any(v_members);
    if v_draft_open then
      with removed as (
        delete from public.draft_dance_scores d
        where d.episode_id = ep.id and d.couple_id = any(v_old_members) and not (d.couple_id = any(v_members))
          and d.dance_style_id = existing.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(existing.song_title)
        returning d.couple_id
      ) select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_deleted from removed;
      if cardinality(v_deleted) > 0 then v_touched := true; end if;
      select v_posted || coalesce(array_agg(couple_id), '{}'::uuid[]) into v_posted from public.dance_scores
      where ep.results_published_at is null and episode_id = ep.id and couple_id = any(v_deleted);
      if (existing.dance_style_id, public.team_song_key(existing.song_title)) is distinct from (v_style, public.team_song_key(v_song)) then
        with renamed as (
          update public.draft_dance_scores d set dance_style_id = v_style, song_title = v_song
          where d.episode_id = ep.id and d.couple_id = any(v_kept)
            and d.dance_style_id = existing.dance_style_id and public.team_song_key(d.song_title) = public.team_song_key(existing.song_title)
          returning d.couple_id
        ) select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_deleted from renamed;
        if cardinality(v_deleted) > 0 then v_touched := true; end if;
        select v_posted || coalesce(array_agg(couple_id), '{}'::uuid[]) into v_posted from public.dance_scores
        where ep.results_published_at is null and episode_id = ep.id and couple_id = any(v_deleted);
      end if;
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
      v_old_members := '{}'::uuid[];
    else
      v_team_id := existing.id;
      select coalesce(array_agg(couple_id), '{}'::uuid[]) into v_old_members from public.episode_team_members where team_id = existing.id;
      update public.episode_teams set name = v_name, song_title = v_song, song_source = nullif(btrim(coalesce(team->>'songSource', '')), ''),
        dance_style_id = v_style, captain_couple_id = v_captain, host_name = nullif(btrim(coalesce(team->>'hostName', '')), ''),
        sort_order = coalesce((team->>'sortOrder')::int, i), updated_at = now()
      where id = existing.id and (name, song_title, song_source, dance_style_id, captain_couple_id, host_name, sort_order) is distinct from
        (v_name, v_song, nullif(btrim(coalesce(team->>'songSource', '')), ''), v_style, v_captain, nullif(btrim(coalesce(team->>'hostName', '')), ''), coalesce((team->>'sortOrder')::int, i));
    end if;
    v_team_ids := v_team_ids || v_team_id;
    insert into public.episode_team_members (team_id, episode_id, couple_id)
    select v_team_id, ep.id, m from unnest(v_members) m on conflict do nothing;
    select coalesce(array_agg(m), '{}'::uuid[]) into v_added from unnest(v_members) m where not (m = any(v_old_members));
    if v_draft_open and cardinality(v_added) > 0 and cardinality(v_old_members) > 0 then
      select jsonb_agg(jsonb_build_object('judgeId', js.judge_id, 'score', js.score)) into v_marks
      from public.draft_judge_scores js
      where js.draft_dance_score_id = (
        select d.id from public.draft_dance_scores d
        where d.episode_id = ep.id and d.couple_id = any(v_old_members) and not (d.couple_id = any(v_added))
          and d.dance_style_id = v_style and public.team_song_key(d.song_title) = public.team_song_key(v_song)
        order by d.couple_id limit 1);
      if v_marks is not null and jsonb_array_length(v_marks) = 4 then
        v_result := public.apply_team_dance(ep.id, p_actor_id, v_team_id, v_marks, v_added);
        select v_posted || coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_posted from jsonb_array_elements_text(v_result->'posted');
        v_collisions := v_collisions || (v_result->'collisions');
        v_touched := true;
      end if;
    end if;
  end loop;

  if v_touched then
    insert into public.draft_episode_overrides (episode_id, updated_by, guest_judge_name, judges_save_available)
    values (ep.id, p_actor_id, ep.guest_judge_name, ep.judges_save_available)
    on conflict (episode_id) do update set updated_at = now(), updated_by = p_actor_id;
  end if;
  return jsonb_build_object('teamIds', to_jsonb(v_team_ids), 'posted', to_jsonb(v_posted), 'collisions', v_collisions);
end;
$$;
revoke all on function public.save_episode_teams(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_teams(uuid, uuid, jsonb) to service_role;

-- save_episode_draft, except that while the episode is unpublished a posted
-- couple's draft dances are left exactly as they are instead of re-copied
-- from the live rows (a team dance waiting in that draft survives). Their
-- outcome and In Jeopardy still save, so Finish Week works after every
-- couple is posted. An entry whose dances differ from the posted couple's
-- draft is reported as skipped, so the client learns that edit did not land.
-- Published corrections pass every entry through unchanged.
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
    if ep.results_published_at is null and exists (select 1 from public.dance_scores where episode_id = ep.id and couple_id = couple) then
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

-- Finishing the week keeps a posted couple's live rows and ignores their
-- draft. That is only safe when the two agree, so publication now refuses
-- while any posted couple's draft holds a dance that never went live (a team
-- score applied after they were posted). Otherwise identical to the atomic
-- publication RPC already applied.
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
  v_dance_id uuid;
  v_preserved uuid[];
  v_departed uuid[];
  v_future uuid[];
  v_couple uuid;
  v_celebrity text;
begin
  -- Hold these only for the commit, never while TypeScript calculates scores.
  -- Other result saves, settings edits and picks must finish before we compare
  -- the snapshot; they cannot race the write once the comparison succeeds.
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
    public.weekly_manager_scores in share row exclusive mode;

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
    or exists (select 1 from public.dance_scores live where live.episode_id = p_episode_id
      and not exists (select 1 from public.draft_dance_scores draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id)
      and not exists (select 1 from public.draft_episode_results draft where draft.episode_id = p_episode_id and draft.couple_id = live.couple_id and draft.outcome = 'bye'))
  ) then raise exception 'Incomplete correction draft. Reload the complete published episode before correcting it.'; end if;

  if not exists (select 1 from public.draft_episode_results where episode_id = p_episode_id) then
    raise exception 'No results to publish for this episode';
  end if;

  select coalesce(array_agg(distinct couple_id), '{}'::uuid[]) into v_preserved
  from public.dance_scores where episode_id = p_episode_id and v_episode.results_published_at is null;
  if cardinality(v_preserved) > 0 and exists (
    select 1 from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved))
  ) then raise exception 'Post every couple before publishing results'; end if;
  foreach v_couple in array v_preserved loop
    if public.episode_couple_dance_signature(p_episode_id, v_couple, true) is distinct from public.episode_couple_dance_signature(p_episode_id, v_couple, false) then
      select p.name into v_celebrity from public.couples c join public.people p on p.id = c.celebrity_id where c.id = v_couple;
      raise exception 'Posted scores for % differ from their draft (a team score or edit arrived after they were posted). Un-Post and Publish them again before finishing the week.', coalesce(v_celebrity, 'a couple');
    end if;
  end loop;

  delete from public.dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved));
  for v_draft in select * from public.draft_dance_scores where episode_id = p_episode_id and not (couple_id = any(v_preserved)) loop
    insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
    select p_episode_id, v_draft.couple_id, v_draft.dance_style_id, v_draft.song_title,
      coalesce(sum(score), 0), coalesce(sum(score) * 3.0 / nullif(count(*), 0), 0)
    from public.draft_judge_scores where draft_dance_score_id = v_draft.id
    returning id into v_dance_id;
    insert into public.judge_scores (dance_score_id, judge_id, score)
    select v_dance_id, judge_id, score from public.draft_judge_scores where draft_dance_score_id = v_draft.id;
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

-- Tell the API about the new tables without waiting for its cache to refresh.
notify pgrst, 'reload schema';
