-- Contributors (propose tier) set up and remove special dances, so a
-- dance-off can be created live on show night by whoever is entering scores.
-- A published week and an already posted dance stay site-admin only (the
-- published check runs under the episode lock, so it cannot race a publish).
--
-- Both bodies are the live definitions (read 2026-11-04 with
-- pg_get_functiondef) with only the permission check changed. Function bodies
-- only; safe to rerun.
begin;

CREATE OR REPLACE FUNCTION public.save_special_dance(p_episode_id uuid, p_actor_id uuid, p_dance jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ep public.episodes; existing public.episode_teams; v_freestyle uuid;
  v_id uuid; v_type text; v_name text; v_auto boolean := false; v_members uuid[]; v_old_members uuid[];
  v_style uuid; v_second uuid; v_songs jsonb; v_song_title text; v_mode text; v_max numeric; v_panel uuid[];
  v_source text; v_theme text; v_details jsonb; v_captain uuid; v_host text; v_sort int; v_scored boolean;
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_special_dance(p_episode_id uuid, p_team_id uuid, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare team public.episode_teams; actor public.profiles;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not coalesce(actor.is_super_admin or actor.can_propose_results, false) then raise exception 'Not authorized to enter results'; end if;
  perform 1 from public.episodes where id = p_episode_id for update;
  -- Read after the lock, so a removal racing a publish sees it.
  if not actor.is_super_admin and exists (select 1 from public.episodes where id = p_episode_id and results_published_at is not null) then
    raise exception 'Only a site admin can change special dances on a published week';
  end if;
  select * into team from public.episode_teams where id = p_team_id and episode_id = p_episode_id for update;
  if team.id is null then raise exception 'That special dance is no longer on this episode'; end if;
  if team.posted_at is not null or exists (select 1 from public.dance_scores where team_id = team.id) then
    raise exception 'Un-post % before removing it', public.special_dance_label(team);
  end if;
  delete from public.episode_teams where id = team.id;
end;
$function$;

revoke all on function public.save_special_dance(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_special_dance(uuid, uuid, jsonb) to service_role;
revoke all on function public.delete_special_dance(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_special_dance(uuid, uuid, uuid) to service_role;

commit;
