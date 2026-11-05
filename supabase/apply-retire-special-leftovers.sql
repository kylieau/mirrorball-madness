-- Retires what special dances and Special Moments left behind.
--
-- 1. The nine functions below are the live definitions (read 2026-11-05) with
--    every reference to the dropped columns and tables taken out:
--    - special_dance_panel is always the night's judges, materialize_team_scores
--      always out of 10, and save_special_dance no longer reads or writes
--      markMax, panelJudgeIds, songSource, themeLabel or a song's artist;
--    - the snapshot, the correction seed, Finish Week and both reveals no
--      longer lock, snapshot, seed or install custom moments.
-- 2. mutate_draft_moment, draft_episode_custom_moments and
--    episode_custom_moments are dropped (zero rows live).
-- 3. episode_teams loses mark_max, panel_judge_ids, song_source and
--    theme_label (every row 10 / null / null / null live), and its songs lose
--    the artist key (5 rows). episode_teams_night_panel goes with the columns;
--    episode_teams_special_checks is recreated without them, since dropping a
--    column drops every check that names it.
--
-- Deploy the app first: the previous build selects these columns on Enter
-- Results. Runs after apply-draft-lineup.sql. Safe to rerun.
begin;

CREATE OR REPLACE FUNCTION public.special_dance_panel(p_team_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (
    select coalesce(array_agg(j.id order by j.id), '{}'::uuid[]) from (
      select p.id from public.people p where p.role = 'judge' and p.archived_at is null
      union
      select g.judge_id from public.episode_guest_judges g where g.episode_id = t.episode_id
    ) j)
  from public.episode_teams t where t.id = p_team_id;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_team_scores(p_episode_id uuid, p_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    v_max := cardinality(v_panel) * 10;
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
$function$;

CREATE OR REPLACE FUNCTION public.save_special_dance(p_episode_id uuid, p_actor_id uuid, p_dance jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ep public.episodes; existing public.episode_teams; v_freestyle uuid;
  v_id uuid; v_type text; v_name text; v_auto boolean := false; v_members uuid[]; v_old_members uuid[];
  v_style uuid; v_second uuid; v_songs jsonb; v_song_title text; v_mode text;
  v_details jsonb; v_captain uuid; v_host text; v_sort int; v_scored boolean;
  song jsonb; detail jsonb; n int; v_candidate text; actor public.profiles;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not coalesce(actor.is_super_admin or actor.can_propose_results, false) then raise exception 'Not authorized to enter results'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  -- Checked under the episode lock, so a save racing a publish sees it.
  if not actor.is_super_admin and ep.results_published_at is not null then
    raise exception 'Only a site admin can change special dances on a published week';
  end if;
  if p_dance is null or jsonb_typeof(p_dance) <> 'object' then raise exception 'A special dance must be an object'; end if;
  if nullif(p_dance->>'id', '') is not null then
    select * into existing from public.episode_teams where id = (p_dance->>'id')::uuid and episode_id = ep.id for update;
    if existing.id is null then raise exception 'That special dance is no longer on this episode. Reload and try again.'; end if;
    -- A posted dance's style and song rewrite its live rows, which only a
    -- site admin may change.
    if existing.posted_at is not null and not actor.is_super_admin then
      raise exception 'Only a site admin can change % once it is posted', public.special_dance_label(existing);
    end if;
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
      v_songs := v_songs || jsonb_build_object('title', btrim(song->>'title'));
    end loop;
  else
    v_songs := coalesce(existing.songs, '[]'::jsonb);
    if p_dance ? 'songTitle' then
      v_song_title := nullif(btrim(coalesce(p_dance->>'songTitle', '')), '');
      if v_song_title is null then
        if jsonb_array_length(v_songs) > 0 then v_songs := v_songs - 0; end if;
      elsif jsonb_array_length(v_songs) = 0 then
        v_songs := jsonb_build_array(jsonb_build_object('title', v_song_title));
      else
        v_songs := jsonb_set(v_songs, '{0,title}', to_jsonb(v_song_title));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_songs) > 4 then raise exception 'A special dance can list up to 4 songs'; end if;
  v_song_title := v_songs #>> '{0,title}';

  v_mode := coalesce(nullif(p_dance->>'scoringMode', ''), existing.scoring_mode, 'marks');
  if v_mode not in ('marks', 'points') then raise exception 'Scoring must be marks or points'; end if;

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
    if v_mode is distinct from existing.scoring_mode then
      if existing.posted_at is not null then raise exception 'Un-post % before changing how it is scored', public.special_dance_label(existing); end if;
      v_scored := exists (select 1 from public.episode_team_marks where team_id = existing.id)
        or exists (select 1 from public.episode_team_scores where team_id = existing.id and points is not null);
      if v_scored then raise exception 'Clear the saved scores of % before changing how it is scored', public.special_dance_label(existing); end if;
    end if;
  end if;

  if existing.id is null then
    insert into public.episode_teams (episode_id, name, name_is_auto, dance_type, song_title, dance_style_id, second_dance_style_id,
      songs, scoring_mode, details, captain_couple_id, host_name, sort_order)
    values (ep.id, v_name, v_auto, v_type, v_song_title, v_style, v_second,
      v_songs, v_mode, v_details, v_captain, v_host, v_sort)
    returning id into v_id;
  else
    v_id := existing.id;
    update public.episode_teams set name = v_name, name_is_auto = v_auto, dance_type = v_type, song_title = v_song_title,
      dance_style_id = v_style, second_dance_style_id = v_second, songs = v_songs, scoring_mode = v_mode,
      details = v_details, captain_couple_id = v_captain, host_name = v_host, sort_order = v_sort, updated_at = now()
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
$function$;

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
    'teamScores', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select * from public.episode_team_scores where team_id in (select id from public.episode_teams where episode_id = p_episode_id)) r),
    'judges', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id) order by p.id), '[]'::jsonb) from public.people p where p.role = 'judge' and p.archived_at is null),
    'guestJudges', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) from (select episode_id, judge_id from public.episode_guest_judges where episode_id = p_episode_id) r)
  ) as payload) snapshot;
$function$;

CREATE OR REPLACE FUNCTION public.seed_episode_correction(p_episode_id uuid, p_started_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  return token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_weekly_scores(p_episode_id uuid, p_revision text, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare ep public.episodes;
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
    public.episode_participants, public.draft_couple_releases,
    public.weekly_manager_scores in share row exclusive mode;
  select * into strict ep from public.episodes where id=p_episode_id;
  if p_revision is null or p_revision is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then raise exception 'Results or scoring inputs changed. Refresh and try again.'; end if;
  if ep.week_id is null then raise exception 'Episode has no competition week'; end if;
  if exists(select 1 from public.episodes where week_id=ep.week_id and results_published_at is null) then raise exception 'Wait until the whole week is published before recomputing'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'week_id')::uuid is distinct from ep.week_id) then raise exception 'Invalid score week'; end if;
  delete from public.weekly_manager_scores where week_id=ep.week_id;
  insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)
  select league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points
  from jsonb_to_recordset(p_rows) as r(league_id uuid,manager_id uuid,week_id uuid,roster_points numeric,prediction_points numeric,grand_finale_points numeric,total_points numeric);
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_episode_reveal(p_episode_id uuid, p_couple_id uuid, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
    public.episode_participants, public.draft_couple_releases,
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
$function$;

CREATE OR REPLACE FUNCTION public.commit_team_reveal(p_episode_id uuid, p_team_id uuid, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
    public.episode_participants, public.draft_couple_releases,
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
$function$;

CREATE OR REPLACE FUNCTION public.commit_episode_publication(p_episode_id uuid, p_published_by uuid, p_snapshot jsonb, p_plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
    public.episode_participants, public.draft_couple_releases,
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

  if v_episode.week_id is not null then
    if exists (select 1 from jsonb_to_recordset(p_plan->'weeklyScores') as s(week_id uuid) where week_id is distinct from v_episode.week_id) then
      raise exception 'Score rows must belong to this competition week';
    end if;
    delete from public.weekly_manager_scores where week_id = v_episode.week_id;
    insert into public.weekly_manager_scores (league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points)
    select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points
    from jsonb_to_recordset(p_plan->'weeklyScores') as s(league_id uuid, manager_id uuid, week_id uuid, roster_points numeric, prediction_points numeric, grand_finale_points numeric, total_points numeric);
  end if;

  update public.episodes set status = 'completed', results_published_at = now(), results_published_by = p_published_by,
    guest_judge_name = v_override.guest_judge_name, judges_save_available = v_override.judges_save_available
  where id = p_episode_id;
  delete from public.draft_episode_overrides where episode_id = p_episode_id;
  delete from public.draft_dance_scores where episode_id = p_episode_id;
  delete from public.draft_episode_results where episode_id = p_episode_id;
  delete from public.draft_episode_in_jeopardy_couples where episode_id = p_episode_id;
  delete from public.draft_couple_releases where episode_id = p_episode_id;
end;
$function$;

drop function if exists public.mutate_draft_moment(uuid, uuid, uuid, uuid, text, boolean);
drop table if exists public.draft_episode_custom_moments;
drop table if exists public.episode_custom_moments;

alter table public.episode_teams drop constraint if exists episode_teams_night_panel;
alter table public.episode_teams drop constraint if exists episode_teams_special_checks;
alter table public.episode_teams
  drop column if exists mark_max,
  drop column if exists panel_judge_ids,
  drop column if exists song_source,
  drop column if exists theme_label;
alter table public.episode_teams add constraint episode_teams_special_checks check (
  scoring_mode in ('marks', 'points')
  and length(btrim(dance_type)) between 1 and 40
  and jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) <= 4
  and jsonb_typeof(details) = 'array' and jsonb_array_length(details) <= 12
);

update public.episode_teams t
set songs = (select jsonb_agg(e.song - 'artist' order by e.ord) from jsonb_array_elements(t.songs) with ordinality as e(song, ord))
where exists (select 1 from jsonb_array_elements(t.songs) song where song ? 'artist');

commit;
