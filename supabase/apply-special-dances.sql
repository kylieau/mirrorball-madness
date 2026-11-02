-- Special dances: one generic entity for team dances, dance-offs, marathons,
-- relays, trios, and whatever else the show invents. episode_teams keeps its
-- name and grows in place: a Dance Type, flexible songs and details, a
-- scoring mode (judges' marks on a per-dance max over a panel of 2 to 4, or
-- points per couple), and a service-only episode_team_scores table for the
-- points and results. Posting still writes one tagged dance_scores row per
-- eligible participant through materialize_team_scores, now with max_score
-- (panel x per-judge max for marks, 0 for points), so every reader keeps
-- summing "a couple's rows in an episode".
--
-- Additive and re-runnable, apart from one constraint drop guarded by
-- "if exists" (a couple may now be in several special dances in one night).
-- Runs AFTER apply-team-dance-entity.sql and cleanup-disney-night-slot2.sql,
-- only with Kylie's OK (preview and production share one database), and not
-- on a show night. Deploying the code first is safe: the app probes for
-- episode_teams.scoring_mode and dance_scores.max_score and keeps the team
-- behaviour until both exist.
--
-- Before running it, confirm the unique constraint's real name:
--   select conname from pg_constraint where conrelid = 'public.episode_team_members'::regclass;
-- Verification queries to run before and after are at the bottom.
begin;

do $$ begin
  if to_regclass('public.episode_teams') is null then
    raise exception 'Apply apply-team-dance-entity.sql first';
  end if;
end $$;

-- Backups, inside the transaction. "if not exists" keeps a rerun from
-- overwriting the first copy. Only the service role may read them: marks are
-- drafts until the dance is posted.
create table if not exists public._backup_20261103_episode_teams as select t.*, now() as backed_up_at from public.episode_teams t;
create table if not exists public._backup_20261103_episode_team_members as select m.*, now() as backed_up_at from public.episode_team_members m;
create table if not exists public._backup_20261103_episode_team_marks as select k.*, now() as backed_up_at from public.episode_team_marks k;
revoke all on public._backup_20261103_episode_teams, public._backup_20261103_episode_team_members, public._backup_20261103_episode_team_marks
  from public, anon, authenticated;
alter table public._backup_20261103_episode_teams enable row level security;
alter table public._backup_20261103_episode_team_members enable row level security;
alter table public._backup_20261103_episode_team_marks enable row level security;

-- Every existing team reads as a Team Dance scored by marks out of 10 on the
-- night's panel (panel_judge_ids null), which is exactly what it was.
alter table public.episode_teams add column if not exists dance_type text not null default 'Team Dance';
alter table public.episode_teams add column if not exists scoring_mode text not null default 'marks';
alter table public.episode_teams add column if not exists mark_max numeric not null default 10;
alter table public.episode_teams add column if not exists panel_judge_ids uuid[];
alter table public.episode_teams add column if not exists second_dance_style_id uuid references public.dance_styles(id);
alter table public.episode_teams add column if not exists songs jsonb not null default '[]'::jsonb;
alter table public.episode_teams add column if not exists theme_label text;
alter table public.episode_teams add column if not exists details jsonb not null default '[]'::jsonb;
alter table public.episode_teams add column if not exists name_is_auto boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'episode_teams_special_checks' and conrelid = 'public.episode_teams'::regclass) then
    alter table public.episode_teams add constraint episode_teams_special_checks check (
      scoring_mode in ('marks', 'points')
      and mark_max > 0 and mark_max <= 10 and mark_max * 2 = trunc(mark_max * 2)
      and length(btrim(dance_type)) between 1 and 40
      and jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) <= 4
      and jsonb_typeof(details) = 'array' and jsonb_array_length(details) <= 12
      and (panel_judge_ids is null or cardinality(panel_judge_ids) between 2 and 4)
    );
  end if;
end $$;

-- A couple may be in several special dances in one night (the team dance and
-- a dance-off). Participants keep the order they were entered in.
alter table public.episode_team_members drop constraint if exists episode_team_members_episode_id_couple_id_key;
alter table public.episode_team_members add column if not exists sort_order integer not null default 0;

-- Draft points and results of a Points-mode dance. Service role only, like
-- episode_team_marks: episode_team_members is readable by every signed-in
-- user, so a dance-off winner must never be stored there before air.
create table if not exists public.episode_team_scores (
  team_id uuid not null references public.episode_teams(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  points numeric check (points is null or (points between -100 and 100 and points * 2 = trunc(points * 2))),
  result text check (result is null or length(result) <= 40),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (team_id, couple_id)
);
alter table public.episode_team_scores enable row level security;
revoke all on public.episode_team_scores from public, anon, authenticated;
grant all on public.episode_team_scores to service_role;

-- What a live row was out of: panel x per-judge max for a special dance
-- scored by marks, 0 for points, null for every row written before this
-- (readers recover a null's panel from total_score and scaled_score).
alter table public.dance_scores add column if not exists max_score numeric;

-- Half points and the dance's own per-judge max on marks; the table's 0..10
-- check stays as the outer bound.
create or replace function public.check_team_mark() returns trigger language plpgsql set search_path = '' as $$
declare v_max numeric;
begin
  select mark_max into v_max from public.episode_teams where id = new.team_id;
  if new.score > coalesce(v_max, 10) or new.score * 2 <> trunc(new.score * 2) then
    raise exception 'Judge scores must be 0 to % in steps of 0.5', coalesce(v_max, 10);
  end if;
  return new;
end $$;
drop trigger if exists episode_team_marks_range on public.episode_team_marks;
create trigger episode_team_marks_range before insert or update on public.episode_team_marks
  for each row execute function public.check_team_mark();

-- Lossless backfill of the existing (Disney Night) teams, guarded so a rerun
-- changes nothing: the song moves into songs, the captain (with the couple
-- id and the celebrity's name) and the host into details. The legacy columns
-- stay and are mirrored by every save from now on.
update public.episode_teams set songs = jsonb_build_array(jsonb_build_object('title', song_title, 'artist', null))
  where songs = '[]'::jsonb and song_title is not null;
update public.episode_teams t set details =
    case when t.captain_couple_id is not null then jsonb_build_array(jsonb_build_object(
      'label', 'Captain', 'coupleId', t.captain_couple_id,
      'value', coalesce((select p.name from public.couples c join public.people p on p.id = c.celebrity_id where c.id = t.captain_couple_id), '')))
    else '[]'::jsonb end
    || case when t.host_name is not null then jsonb_build_array(jsonb_build_object('label', 'Host', 'value', t.host_name)) else '[]'::jsonb end
  where t.details = '[]'::jsonb and (t.captain_couple_id is not null or t.host_name is not null);

-- "Team Slaytopia" for a Team Dance, the dance's own name otherwise. Mirrors
-- the label the app's plan builder uses in its messages.
create or replace function public.special_dance_label(p_team public.episode_teams)
returns text language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p_team.dance_type, 'Team Dance')) = 'Team Dance' then 'Team ' || p_team.name else p_team.name end;
$$;
revoke all on function public.special_dance_label(public.episode_teams) from public, anon, authenticated;
grant execute on function public.special_dance_label(public.episode_teams) to service_role;

-- The judges whose marks a special dance takes: its own panel when one was
-- chosen ("Didn't judge" drops one), else the standing panel plus this
-- night's guests.
create or replace function public.special_dance_panel(p_team_id uuid)
returns uuid[] language sql stable security invoker set search_path = '' as $$
  select coalesce(t.panel_judge_ids, (
    select coalesce(array_agg(j.id order by j.id), '{}'::uuid[]) from (
      select p.id from public.people p where p.role = 'judge' and p.archived_at is null
      union
      select g.judge_id from public.episode_guest_judges g where g.episode_id = t.episode_id
    ) j))
  from public.episode_teams t where t.id = p_team_id;
$$;
revoke all on function public.special_dance_panel(uuid) from public, anon, authenticated;
grant execute on function public.special_dance_panel(uuid) to service_role;

-- How far along a special dance's scoring is: marks from every judge on its
-- panel (2 to 4 of them), or points for every eligible participant.
create or replace function public.special_dance_status(p_team_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare team public.episode_teams; v_panel uuid[]; v_done int; v_total int; v_complete boolean;
begin
  select * into team from public.episode_teams where id = p_team_id;
  if team.id is null then return null; end if;
  if team.scoring_mode = 'points' then
    select count(*), count(*) filter (where exists (select 1 from public.episode_team_scores s where s.team_id = team.id and s.couple_id = m and s.points is not null))
      into v_total, v_done from public.team_eligible_members(team.episode_id, team.id) m;
    v_complete := v_total > 0 and v_done = v_total;
  else
    v_panel := public.special_dance_panel(team.id);
    v_total := cardinality(v_panel);
    select count(*) into v_done from public.episode_team_marks k where k.team_id = team.id and k.judge_id = any(v_panel);
    v_complete := v_total between 2 and 4 and v_done = v_total;
  end if;
  return jsonb_build_object('mode', team.scoring_mode, 'done', v_done, 'total', v_total, 'complete', v_complete, 'label', public.special_dance_label(team));
end;
$$;
revoke all on function public.special_dance_status(uuid) from public, anon, authenticated;
grant execute on function public.special_dance_status(uuid) to service_role;

create or replace function public.special_dance_complete(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((public.special_dance_status(p_team_id)->>'complete')::boolean, false);
$$;
revoke all on function public.special_dance_complete(uuid) from public, anon, authenticated;
grant execute on function public.special_dance_complete(uuid) to service_role;

-- The message that stops a post or Finish Week while a dance is half scored,
-- by name; null once it is complete. p_when finishes the sentence ("first",
-- "before finishing the week").
create or replace function public.special_dance_blocker(p_team_id uuid, p_when text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare s jsonb;
begin
  s := public.special_dance_status(p_team_id);
  if s is null or (s->>'complete')::boolean then return null; end if;
  if s->>'mode' = 'points' then
    return format('%s has points for %s of %s couples. Enter every couple''s points or remove it %s.', s->>'label', s->>'done', s->>'total', p_when);
  elsif not ((s->>'total')::int between 2 and 4) then
    return format('%s needs 2 to 4 judges and has %s. Fix its panel %s.', s->>'label', s->>'total', p_when);
  end if;
  return format('%s has %s of %s marks. Score it or remove it %s.', s->>'label', s->>'done', s->>'total', p_when);
end;
$$;
revoke all on function public.special_dance_blocker(uuid, text) from public, anon, authenticated;
grant execute on function public.special_dance_blocker(uuid, text) to service_role;

-- A plan built by code that does not know max_score would pay a Points row
-- as a dance with no marks. Every commit RPC refuses such a plan while the
-- episode has a Points-mode dance; ordinary nights keep publishing.
create or replace function public.assert_special_dance_plan(p_episode_id uuid, p_plan jsonb)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce(nullif(p_plan->>'planVersion', '')::int, 0) < 2
     and exists (select 1 from public.episode_teams where episode_id = p_episode_id and scoring_mode = 'points') then
    raise exception 'This episode has a special dance scored in points, which this version of the app cannot score. Reload the page and try again.';
  end if;
end;
$$;
revoke all on function public.assert_special_dance_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.assert_special_dance_plan(uuid, jsonb) to service_role;

-- One tagged live row per eligible participant, inserted or rewritten in
-- place, rows of members no longer eligible removed. Marks: the panel's total
-- over panel x per-judge max, scaled to 30, judge marks copied. Points: the
-- points as a 0-max row with no judge marks. Shared by the post and by
-- Finish Week.
create or replace function public.materialize_team_scores(p_episode_id uuid, p_team_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  team public.episode_teams; v_blocker text; v_panel uuid[]; v_total numeric; v_max numeric;
  v_member uuid; v_live_id uuid;
begin
  select * into strict team from public.episode_teams where id = p_team_id and episode_id = p_episode_id;
  v_blocker := public.special_dance_blocker(team.id, 'first');
  if v_blocker is not null then raise exception '%', v_blocker; end if;
  if team.scoring_mode = 'points' then
    for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
      insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, max_score, team_id)
      select p_episode_id, v_member, team.dance_style_id, team.song_title, s.points, 0, 0, team.id
      from public.episode_team_scores s where s.team_id = team.id and s.couple_id = v_member
      on conflict (team_id, couple_id) where team_id is not null do update
        set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
            total_score = excluded.total_score, scaled_score = excluded.scaled_score, max_score = excluded.max_score
      returning id into v_live_id;
      delete from public.judge_scores where dance_score_id = v_live_id;
    end loop;
  else
    v_panel := public.special_dance_panel(team.id);
    select coalesce(sum(score), 0) into v_total from public.episode_team_marks where team_id = team.id and judge_id = any(v_panel);
    v_max := cardinality(v_panel) * team.mark_max;
    for v_member in select * from public.team_eligible_members(p_episode_id, team.id) loop
      insert into public.dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, max_score, team_id)
      values (p_episode_id, v_member, team.dance_style_id, team.song_title, v_total, v_total * 30 / v_max, v_max, team.id)
      on conflict (team_id, couple_id) where team_id is not null do update
        set dance_style_id = excluded.dance_style_id, song_title = excluded.song_title,
            total_score = excluded.total_score, scaled_score = excluded.scaled_score, max_score = excluded.max_score
      returning id into v_live_id;
      delete from public.judge_scores where dance_score_id = v_live_id;
      insert into public.judge_scores (dance_score_id, judge_id, score)
      select v_live_id, judge_id, score from public.episode_team_marks where team_id = team.id and judge_id = any(v_panel);
    end loop;
  end if;
  delete from public.dance_scores d where d.team_id = team.id
    and not exists (select 1 from public.team_eligible_members(p_episode_id, team.id) m where m = d.couple_id);
end;
$$;
revoke all on function public.materialize_team_scores(uuid, uuid) from public, anon, authenticated;
grant execute on function public.materialize_team_scores(uuid, uuid) to service_role;

-- Admin. Upserts ONE special dance (the inline editor's Done). A key that is
-- absent from the payload keeps its stored value, so an older client's
-- payload (name, songTitle, songSource, danceStyleId, captainCoupleId,
-- hostName, memberCoupleIds, sortOrder) is still complete: songTitle rewrites
-- the first song, captainCoupleId and hostName their detail rows. song_title,
-- captain_couple_id and host_name are mirrored from songs and details.
-- A blank name gets "<Dance Type>" or "<Dance Type> N" and name_is_auto.
-- A posted dance may change its display fields (its live rows follow the
-- style and song); participants and scoring wait for an un-post, and scoring
-- also waits until the saved marks or points are cleared.
create or replace function public.save_special_dance(p_episode_id uuid, p_actor_id uuid, p_dance jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; existing public.episode_teams; v_freestyle uuid;
  v_id uuid; v_type text; v_name text; v_auto boolean := false; v_members uuid[]; v_old_members uuid[];
  v_style uuid; v_second uuid; v_songs jsonb; v_song_title text; v_mode text; v_max numeric; v_panel uuid[];
  v_source text; v_theme text; v_details jsonb; v_captain uuid; v_host text; v_sort int; v_scored boolean;
  song jsonb; detail jsonb; n int; v_candidate text;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Only a site admin can set up special dances';
  end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_dance is null or jsonb_typeof(p_dance) <> 'object' then raise exception 'A special dance must be an object'; end if;
  if nullif(p_dance->>'id', '') is not null then
    select * into existing from public.episode_teams where id = (p_dance->>'id')::uuid and episode_id = ep.id for update;
    if existing.id is null then raise exception 'That special dance is no longer on this episode. Reload and try again.'; end if;
  end if;
  select id into v_freestyle from public.dance_styles where lower(name) = 'freestyle' order by created_at limit 1;

  v_type := btrim(coalesce(p_dance->>'danceType', existing.dance_type, 'Team Dance'));
  if length(v_type) not between 1 and 40 then raise exception 'Dance Type must be 1 to 40 characters'; end if;

  if p_dance ? 'memberCoupleIds' then
    if jsonb_typeof(p_dance->'memberCoupleIds') <> 'array' then raise exception 'Participants must be a list'; end if;
    select coalesce(array_agg(d.id order by d.ord), '{}'::uuid[]) into v_members from (
      select (e.x #>> '{}')::uuid as id, min(e.ord) as ord
      from jsonb_array_elements(p_dance->'memberCoupleIds') with ordinality as e(x, ord) group by 1
    ) d;
  elsif existing.id is not null then
    select coalesce(array_agg(couple_id order by sort_order, couple_id), '{}'::uuid[]) into v_members from public.episode_team_members where team_id = existing.id;
  else
    v_members := '{}'::uuid[];
  end if;
  if cardinality(v_members) < 1 then raise exception 'A special dance needs at least one participant'; end if;
  if exists (select 1 from unnest(v_members) m(id) where not exists (select 1 from public.couples c where c.id = m.id and c.season_id = ep.season_id)) then
    raise exception 'A participant is not in this season';
  end if;

  v_style := coalesce(nullif(p_dance->>'danceStyleId', '')::uuid, existing.dance_style_id, v_freestyle);
  if v_style is null or not exists (select 1 from public.dance_styles where id = v_style) then raise exception 'Pick a dance style'; end if;
  if p_dance ? 'secondDanceStyleId' then v_second := nullif(p_dance->>'secondDanceStyleId', '')::uuid; else v_second := existing.second_dance_style_id; end if;
  if v_second is not null and not exists (select 1 from public.dance_styles where id = v_second) then raise exception 'Pick a second dance style that exists'; end if;

  if p_dance ? 'songs' then
    if jsonb_typeof(p_dance->'songs') <> 'array' then raise exception 'Songs must be a list'; end if;
    v_songs := '[]'::jsonb;
    for song in select * from jsonb_array_elements(p_dance->'songs') loop
      continue when jsonb_typeof(song) <> 'object' or nullif(btrim(coalesce(song->>'title', '')), '') is null;
      v_songs := v_songs || jsonb_build_object('title', btrim(song->>'title'), 'artist', nullif(btrim(coalesce(song->>'artist', '')), ''));
    end loop;
  else
    v_songs := coalesce(existing.songs, '[]'::jsonb);
    if p_dance ? 'songTitle' then
      v_song_title := nullif(btrim(coalesce(p_dance->>'songTitle', '')), '');
      if v_song_title is null then
        if jsonb_array_length(v_songs) > 0 then v_songs := v_songs - 0; end if;
      elsif jsonb_array_length(v_songs) = 0 then
        v_songs := jsonb_build_array(jsonb_build_object('title', v_song_title, 'artist', null));
      else
        v_songs := jsonb_set(v_songs, '{0,title}', to_jsonb(v_song_title));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_songs) > 4 then raise exception 'A special dance can list up to 4 songs'; end if;
  v_song_title := v_songs #>> '{0,title}';

  v_mode := coalesce(nullif(p_dance->>'scoringMode', ''), existing.scoring_mode, 'marks');
  if v_mode not in ('marks', 'points') then raise exception 'Scoring must be marks or points'; end if;
  v_max := coalesce(nullif(p_dance->>'markMax', '')::numeric, existing.mark_max, 10);
  if not (v_max > 0 and v_max <= 10 and v_max * 2 = trunc(v_max * 2)) then raise exception 'Out of must be 1 to 10 in steps of 0.5'; end if;
  if p_dance ? 'panelJudgeIds' then
    if jsonb_typeof(p_dance->'panelJudgeIds') = 'array' then
      select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}'::uuid[]) into v_panel from jsonb_array_elements(p_dance->'panelJudgeIds') x;
    else
      v_panel := null;
    end if;
  else
    v_panel := existing.panel_judge_ids;
  end if;
  if v_mode = 'points' then v_panel := null; end if;
  if v_panel is not null then
    if cardinality(v_panel) not between 2 and 4 then raise exception 'Judges'' Marks need 2 to 4 judges'; end if;
    if exists (select 1 from unnest(v_panel) j(id) where not exists (select 1 from public.people p where p.id = j.id and p.role = 'judge')) then
      raise exception 'Every judge on the panel must be a judge';
    end if;
  end if;

  if p_dance ? 'songSource' then v_source := nullif(btrim(coalesce(p_dance->>'songSource', '')), ''); else v_source := existing.song_source; end if;
  if p_dance ? 'themeLabel' then v_theme := nullif(btrim(coalesce(p_dance->>'themeLabel', '')), ''); else v_theme := existing.theme_label; end if;

  if p_dance ? 'details' then
    if jsonb_typeof(p_dance->'details') <> 'array' then raise exception 'Details must be a list'; end if;
    v_details := '[]'::jsonb;
    for detail in select * from jsonb_array_elements(p_dance->'details') loop
      continue when jsonb_typeof(detail) <> 'object';
      if nullif(btrim(coalesce(detail->>'label', '')), '') is null then raise exception 'Every extra detail needs a label'; end if;
      v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
        'label', btrim(detail->>'label'), 'value', btrim(coalesce(detail->>'value', '')), 'coupleId', nullif(detail->>'coupleId', '')::uuid));
    end loop;
  else
    v_details := coalesce(existing.details, '[]'::jsonb);
    if p_dance ? 'captainCoupleId' then
      select coalesce(jsonb_agg(e.d order by e.ord), '[]'::jsonb) into v_details
      from jsonb_array_elements(v_details) with ordinality as e(d, ord) where lower(e.d->>'label') <> 'captain';
      if nullif(p_dance->>'captainCoupleId', '') is not null then
        v_details := v_details || jsonb_build_object('label', 'Captain', 'coupleId', (p_dance->>'captainCoupleId')::uuid,
          'value', coalesce((select p.name from public.couples c join public.people p on p.id = c.celebrity_id where c.id = (p_dance->>'captainCoupleId')::uuid), ''));
      end if;
    end if;
    if p_dance ? 'hostName' then
      select coalesce(jsonb_agg(e.d order by e.ord), '[]'::jsonb) into v_details
      from jsonb_array_elements(v_details) with ordinality as e(d, ord) where lower(e.d->>'label') <> 'host';
      if nullif(btrim(coalesce(p_dance->>'hostName', '')), '') is not null then
        v_details := v_details || jsonb_build_object('label', 'Host', 'value', btrim(p_dance->>'hostName'));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_details) > 12 then raise exception 'A special dance can carry up to 12 extra details'; end if;
  for detail in select * from jsonb_array_elements(v_details) loop
    continue when detail->>'coupleId' is null;
    if not exists (select 1 from public.couples c where c.id = (detail->>'coupleId')::uuid and c.season_id = ep.season_id) then
      raise exception 'Detail "%" names a couple who is not in this season', detail->>'label';
    end if;
    if lower(detail->>'label') = 'captain' and not ((detail->>'coupleId')::uuid = any(v_members)) then
      raise exception 'The captain must be on the team';
    end if;
  end loop;
  select (d->>'coupleId')::uuid into v_captain from jsonb_array_elements(v_details) d where lower(d->>'label') = 'captain' and d->>'coupleId' is not null limit 1;
  select nullif(btrim(d->>'value'), '') into v_host from jsonb_array_elements(v_details) d where lower(d->>'label') = 'host' limit 1;

  v_name := btrim(coalesce(p_dance->>'name', case when existing.name_is_auto then '' else existing.name end, ''));
  if v_name = '' then
    v_auto := true;
    n := 1;
    loop
      v_candidate := case when n = 1 then v_type else v_type || ' ' || n end;
      exit when not exists (select 1 from public.episode_teams t where t.episode_id = ep.id and lower(t.name) = lower(v_candidate) and t.id is distinct from existing.id);
      n := n + 1;
    end loop;
    v_name := v_candidate;
  elsif exists (select 1 from public.episode_teams t where t.episode_id = ep.id and lower(t.name) = lower(v_name) and t.id is distinct from existing.id) then
    raise exception 'Another special dance is already called "%"', v_name;
  end if;

  v_sort := coalesce(nullif(p_dance->>'sortOrder', '')::int, existing.sort_order,
    (select coalesce(max(sort_order), 0) + 1 from public.episode_teams where episode_id = ep.id));

  if existing.id is not null then
    select coalesce(array_agg(couple_id order by couple_id), '{}'::uuid[]) into v_old_members from public.episode_team_members where team_id = existing.id;
    if existing.posted_at is not null
       and (select coalesce(array_agg(m order by m), '{}'::uuid[]) from unnest(v_members) m) is distinct from v_old_members then
      raise exception 'Un-post % before changing its participants', public.special_dance_label(existing);
    end if;
    if (v_mode, v_max, v_panel) is distinct from (existing.scoring_mode, existing.mark_max, existing.panel_judge_ids) then
      if existing.posted_at is not null then raise exception 'Un-post % before changing how it is scored', public.special_dance_label(existing); end if;
      v_scored := exists (select 1 from public.episode_team_marks where team_id = existing.id)
        or exists (select 1 from public.episode_team_scores where team_id = existing.id and points is not null);
      if v_scored then raise exception 'Clear the saved scores of % before changing how it is scored', public.special_dance_label(existing); end if;
    end if;
  end if;

  if existing.id is null then
    insert into public.episode_teams (episode_id, name, name_is_auto, dance_type, song_title, song_source, theme_label, dance_style_id, second_dance_style_id,
      songs, scoring_mode, mark_max, panel_judge_ids, details, captain_couple_id, host_name, sort_order)
    values (ep.id, v_name, v_auto, v_type, v_song_title, v_source, v_theme, v_style, v_second,
      v_songs, v_mode, v_max, v_panel, v_details, v_captain, v_host, v_sort)
    returning id into v_id;
  else
    v_id := existing.id;
    update public.episode_teams set name = v_name, name_is_auto = v_auto, dance_type = v_type, song_title = v_song_title, song_source = v_source,
      theme_label = v_theme, dance_style_id = v_style, second_dance_style_id = v_second, songs = v_songs, scoring_mode = v_mode, mark_max = v_max,
      panel_judge_ids = v_panel, details = v_details, captain_couple_id = v_captain, host_name = v_host, sort_order = v_sort, updated_at = now()
    where id = existing.id;
    update public.dance_scores set dance_style_id = v_style, song_title = v_song_title
    where team_id = existing.id and (dance_style_id, song_title) is distinct from (v_style, v_song_title);
    delete from public.episode_team_members where team_id = existing.id and not (couple_id = any(v_members));
    delete from public.episode_team_scores where team_id = existing.id and (v_mode = 'marks' or not (couple_id = any(v_members)));
    if v_mode = 'points' then delete from public.episode_team_marks where team_id = existing.id; end if;
  end if;
  insert into public.episode_team_members (team_id, episode_id, couple_id, sort_order)
  select v_id, ep.id, e.m, e.ord from unnest(v_members) with ordinality as e(m, ord)
  on conflict (team_id, couple_id) do update set sort_order = excluded.sort_order;
  return v_id;
end;
$$;
revoke all on function public.save_special_dance(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_special_dance(uuid, uuid, jsonb) to service_role;

-- Admin. Removes a special dance that is not posted (its members, marks and
-- points go with it). A posted one keeps its live rows: un-post it first.
create or replace function public.delete_special_dance(p_episode_id uuid, p_team_id uuid, p_actor_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare team public.episode_teams;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Only a site admin can remove a special dance';
  end if;
  perform 1 from public.episodes where id = p_episode_id for update;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if team.posted_at is not null or exists (select 1 from public.dance_scores where team_id = team.id) then
    raise exception 'Un-post % before removing it', public.special_dance_label(team);
  end if;
  delete from public.episode_teams where id = team.id;
end;
$$;
revoke all on function public.delete_special_dance(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_special_dance(uuid, uuid, uuid) to service_role;

-- The whole-episode save older clients call: entries missing from the list
-- are removed (posted ones refuse), the rest go through save_special_dance
-- one by one, so an old payload's absent keys keep their stored values.
create or replace function public.save_episode_teams(p_episode_id uuid, p_actor_id uuid, p_teams jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; team jsonb; existing public.episode_teams; v_team_ids uuid[] := '{}'; v_names text[] := '{}'; v_name text; i int := 0;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Only a site admin can set up teams';
  end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_teams is null or jsonb_typeof(p_teams) <> 'array' then raise exception 'Teams must be a list'; end if;
  for team in select * from jsonb_array_elements(p_teams) loop
    v_name := lower(btrim(coalesce(team->>'name', '')));
    if v_name <> '' then
      if v_name = any(v_names) then raise exception 'Two teams are both called "%"', btrim(team->>'name'); end if;
      v_names := v_names || v_name;
    end if;
    if nullif(team->>'id', '') is not null and not exists (select 1 from public.episode_teams where id = (team->>'id')::uuid and episode_id = ep.id) then
      raise exception 'Team "%" is no longer on this episode. Reload and try again.', coalesce(nullif(btrim(team->>'name'), ''), team->>'id');
    end if;
  end loop;
  for existing in
    select * from public.episode_teams t where t.episode_id = ep.id
      and not exists (select 1 from jsonb_array_elements(p_teams) x where x->>'id' = t.id::text)
  loop
    perform public.delete_special_dance(ep.id, existing.id, p_actor_id);
  end loop;
  for team in select * from jsonb_array_elements(p_teams) loop
    i := i + 1;
    v_team_ids := v_team_ids || public.save_special_dance(ep.id, p_actor_id,
      case when team ? 'sortOrder' then team else team || jsonb_build_object('sortOrder', i) end);
  end loop;
  return jsonb_build_object('teamIds', to_jsonb(v_team_ids));
end;
$$;
revoke all on function public.save_episode_teams(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_teams(uuid, uuid, jsonb) to service_role;

-- Propose tier. Saves whatever marks are in (partial sets survive a reload);
-- posting needs a mark from every judge on the dance's panel of 2 to 4. A
-- posted dance keeps its live rows until it is re-posted.
create or replace function public.save_team_marks(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_marks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; team public.episode_teams; v_panel uuid[]; mark jsonb; v_score numeric;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into strict ep from public.episodes where id = p_episode_id;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if team.scoring_mode <> 'marks' then raise exception '% is scored in points, not judges'' marks', public.special_dance_label(team); end if;
  v_panel := public.special_dance_panel(team.id);
  if cardinality(v_panel) not between 2 and 4 then
    raise exception '% needs 2 to 4 judges and this night has %. Set the guest judge on Schedule or choose its judges first.', public.special_dance_label(team), cardinality(v_panel);
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > cardinality(v_panel) then
    raise exception 'Marks must be a list of at most %', cardinality(v_panel);
  end if;
  for mark in select * from jsonb_array_elements(p_marks) loop
    v_score := nullif(mark->>'score', '')::numeric;
    if v_score is null or v_score < 0 or v_score > team.mark_max or v_score * 2 <> trunc(v_score * 2) then
      raise exception 'Judge scores must be 0 to % in steps of 0.5', team.mark_max;
    end if;
    if not ((mark->>'judgeId')::uuid = any(v_panel)) then raise exception 'Marks must be for this dance''s judges'; end if;
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

-- Propose tier. Each participant's points and result in a Points-mode dance:
-- [{coupleId, points, result}]. A blank box arrives as null and keeps the
-- dance from posting; 0 is an explicit entry. Negative points are a penalty.
create or replace function public.save_special_dance_points(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_scores jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare ep public.episodes; team public.episode_teams; score jsonb; v_couple uuid; v_points numeric; v_result text;
begin
  perform public.assert_episode_draft_actor(p_episode_id, p_actor_id);
  select * into strict ep from public.episodes where id = p_episode_id;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if team.scoring_mode <> 'points' then raise exception '% is scored by judges'' marks, not points', public.special_dance_label(team); end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'array' then raise exception 'Points must be a list'; end if;
  for score in select * from jsonb_array_elements(p_scores) loop
    v_couple := nullif(score->>'coupleId', '')::uuid;
    if v_couple is null or not exists (select 1 from public.episode_team_members m where m.team_id = team.id and m.couple_id = v_couple) then
      raise exception 'Points must be for this dance''s participants';
    end if;
    v_points := nullif(score->>'points', '')::numeric;
    if v_points is not null and (v_points < -100 or v_points > 100 or v_points * 2 <> trunc(v_points * 2)) then
      raise exception 'Points must be between -100 and 100 in steps of 0.5';
    end if;
    v_result := nullif(btrim(coalesce(score->>'result', '')), '');
    if length(v_result) > 40 then raise exception 'A result is limited to 40 characters'; end if;
    insert into public.episode_team_scores (team_id, couple_id, points, result, updated_by)
    values (team.id, v_couple, v_points, v_result, p_actor_id)
    on conflict (team_id, couple_id) do update
      set points = excluded.points, result = excluded.result, updated_at = now(), updated_by = excluded.updated_by;
  end loop;
  update public.episode_teams set updated_at = now() where id = team.id;
  insert into public.draft_episode_overrides (episode_id, updated_by, guest_judge_name, judges_save_available)
  values (ep.id, p_actor_id, ep.guest_judge_name, ep.judges_save_available)
  on conflict (episode_id) do update set updated_at = now(), updated_by = p_actor_id;
end;
$$;
revoke all on function public.save_special_dance_points(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_special_dance_points(uuid, uuid, uuid, jsonb) to service_role;

-- The snapshot now also carries the Points rows, the standing panel and this
-- night's guests, so a points edit or a panel change between planning and
-- committing fails the revision check, and the plan judges completeness
-- against the same panel special_dance_panel() uses.
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
    'teamMarks', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_marks where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'teamScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_scores where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'judges', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id) order by p.id), '[]'::jsonb) from public.people p where p.role = 'judge' and p.archived_at is null),
    'guestJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select episode_id, judge_id from public.episode_guest_judges where episode_id = p_episode_id) r)
  ) as payload) snapshot;
$$;
revoke all on function public.episode_publication_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.episode_publication_snapshot(uuid) to service_role;

-- Admin. Posts (or un-posts, or re-posts in place) a special dance's score
-- for every eligible participant, independent of whether their own dance is
-- posted, then installs the week's recomputed judges points from the plan.
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
    public.episode_team_marks, public.episode_team_scores in share row exclusive mode;
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id = p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  perform public.assert_special_dance_plan(ep.id, p_plan);
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if not exists (select 1 from public.episode_teams where id = p_team_id and episode_id = ep.id) then raise exception 'That special dance is no longer on this episode'; end if;
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

-- Posting a couple copies only their own draft dances; "already posted" and
-- the undo look only at their own live rows, so a special dance's row for
-- that couple is never touched here. Unchanged apart from the lock list and
-- the plan check.
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
    public.episode_team_marks, public.episode_team_scores in share row exclusive mode;
  if not exists(select 1 from public.profiles where id=p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id=p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  perform public.assert_special_dance_plan(ep.id, p_plan);
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

-- Finishing the week installs the couples' own drafts (keeping a posted
-- couple's live rows, which must agree with their draft), then materializes
-- every special dance: rows for one never posted, rewrites for posted ones.
-- A dance with participants that is not fully scored (a judge on its panel
-- without a mark, a participant without points) stops publication by name.
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
  v_blocker text;
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
    public.episode_team_marks, public.episode_team_scores in share row exclusive mode;

  if not exists (select 1 from public.profiles where id = p_published_by and is_super_admin) then
    raise exception 'Not authorized to publish results';
  end if;
  perform public.assert_special_dance_plan(p_episode_id, p_plan);
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

  for v_team in select * from public.episode_teams where episode_id = p_episode_id order by sort_order, created_at loop
    continue when not exists (select 1 from public.episode_team_members where team_id = v_team.id);
    v_blocker := public.special_dance_blocker(v_team.id, 'before finishing the week');
    if v_blocker is not null then raise exception '%', v_blocker; end if;
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

  for v_team in select * from public.episode_teams where episode_id = p_episode_id order by sort_order, created_at loop
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

-- Tell the API about the new table and columns without waiting for its cache to refresh.
notify pgrst, 'reload schema';

-- Verify (read-only; run before AND after, every number must match, and in
-- the after run songs and details must show the same song, host and captain):
--   select count(*) teams, count(*) filter (where posted_at is not null) posted from public.episode_teams;
--   select count(*) from public.episode_team_members;
--   select count(*), sum(score) from public.episode_team_marks;
--   select count(*), sum(total_score), sum(scaled_score) from public.dance_scores where team_id is not null;
--   select id, name, song_title, song_source, host_name, captain_couple_id, songs, details from public.episode_teams order by name;
-- After only:
--   select count(*) from public._backup_20261103_episode_teams;          -- equals the teams count above
--   select count(*) from public._backup_20261103_episode_team_members;   -- equals the members count above
--   select count(*) from public._backup_20261103_episode_team_marks;     -- equals the marks count above
--   select conname from pg_constraint where conrelid = 'public.episode_team_members'::regclass;  -- no episode_id, couple_id unique
--   select proname from pg_proc where proname in ('save_special_dance', 'delete_special_dance', 'save_special_dance_points', 'special_dance_panel', 'special_dance_complete');
