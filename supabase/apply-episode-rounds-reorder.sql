-- Edit Episode can remove, rename and reorder any round, Round 1 included
-- (Kylie, 2026-11-24). A new episode still starts with the Individual Dance.
-- A plan keeps at least one round where every couple dances their own.
--
-- A saved draft dance's dance_slot (apply-draft-dance-slots.sql) is its own
-- round's place among the own rounds, so a plan that removes or reorders own
-- rounds renumbers the saved dances in the same transaction, and stamps the
-- draft so an open Enter Results page reloads its rows. It refuses:
--   * removing (or turning into another kind) an own round with saved dances;
--   * moving own rounds while a dance saved before slots has none;
--   * removing or reordering a published week's own rounds (adding one after
--     them still works, as before).
-- An unpublished special round's heats follow it in the picker (sort_order).
--
-- Replaces save_episode_rounds from apply-episode-rounds.sql; same signature,
-- so the app before this change keeps working. Safe to run again.

create or replace function public.save_episode_rounds(p_episode_id uuid, p_actor_id uuid, p_rounds jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  ep public.episodes; actor public.profiles; r public.episode_rounds; existing public.episode_rounds; team public.episode_teams;
  v_round jsonb; v_heat jsonb; x jsonb; v_old public.episode_round_exceptions;
  v_ids uuid[] := '{}'; v_pos int := 0; v_kind text; v_type text; v_scoring text; v_bonus numeric; v_units int;
  v_mode text; v_k int; v_new uuid; v_name text; i int;
  v_old_own uuid[]; v_old_names text[]; v_new_own uuid[]; v_moved text;
begin
  select * into actor from public.profiles where id = p_actor_id;
  if not coalesce(actor.is_super_admin, false) then raise exception 'Only a site admin can plan an episode''s rounds'; end if;
  select * into strict ep from public.episodes where id = p_episode_id for update;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'An episode needs at least one round';
  end if;
  if jsonb_array_length(p_rounds) > 12 then raise exception 'An episode can have up to 12 rounds'; end if;
  if not exists (select 1 from jsonb_array_elements(p_rounds) e where e->>'kind' = 'own') then
    raise exception 'Keep at least one round where every couple dances their own';
  end if;
  select coalesce(array_agg(id order by position), '{}'), coalesce(array_agg(round_type order by position), '{}')
    into v_old_own, v_old_names from public.episode_rounds where episode_id = ep.id and kind = 'own';

  for r in select * from public.episode_rounds where episode_id = ep.id
      and id <> all (select (e->>'id')::uuid from jsonb_array_elements(p_rounds) e where nullif(e->>'id', '') is not null) loop
    if ep.results_published_at is not null and exists (select 1 from public.episode_round_exceptions where round_id = r.id) then
      raise exception 'Exceptions on a published week change in a correction on Enter Results';
    end if;
    perform public.drop_round_units(r.id, 0);
    delete from public.episode_rounds where id = r.id;
  end loop;

  set constraints public.episode_rounds_position_key deferred;
  for v_round in select * from jsonb_array_elements(p_rounds) loop
    v_pos := v_pos + 1;
    v_kind := v_round->>'kind';
    v_type := btrim(coalesce(v_round->>'roundType', ''));
    if v_kind is null or v_kind not in ('own', 'special', 'none') then raise exception 'A round is a dance per couple, a special dance or elimination only'; end if;
    if length(v_type) not between 1 and 40 then raise exception 'A round''s type is 1 to 40 characters'; end if;
    v_scoring := case v_kind when 'own' then 'marks' when 'none' then 'none' else v_round->>'scoring' end;
    if v_kind = 'special' and (v_scoring is null or v_scoring not in ('couple_marks', 'fixed_bonus', 'ranked_points', 'team_marks')) then
      raise exception 'Pick how % is scored', v_type;
    end if;
    v_units := case when v_kind = 'special' then coalesce(nullif(v_round->>'unitCount', '')::int, 1) else 0 end;
    if v_kind = 'special' and v_units not between 1 and 12 then raise exception '% can have 1 to 12 heats or teams', v_type; end if;
    v_bonus := case when v_scoring = 'fixed_bonus' then nullif(v_round->>'bonusPoints', '')::numeric end;
    if v_bonus is not null and (v_bonus not between -100 and 100 or v_bonus * 2 <> trunc(v_bonus * 2)) then
      raise exception 'A bonus is between -100 and 100 in steps of 0.5';
    end if;

    existing := null;
    if nullif(v_round->>'id', '') is not null then
      select * into existing from public.episode_rounds where id = (v_round->>'id')::uuid and episode_id = ep.id for update;
      if existing.id is null then raise exception 'That round is no longer on this episode. Reload and try again.'; end if;
      if existing.kind <> v_kind and exists (select 1 from public.episode_teams where round_id = existing.id) then
        raise exception 'Remove % and add it again to change what kind of round it is', existing.round_type;
      end if;
      update public.episode_rounds set position = v_pos, kind = v_kind, round_type = v_type, scoring = v_scoring,
        bonus_points = v_bonus, unit_count = v_units, updated_at = now()
      where id = existing.id returning * into r;
    else
      insert into public.episode_rounds (episode_id, position, kind, round_type, scoring, bonus_points, unit_count)
      values (ep.id, v_pos, v_kind, v_type, v_scoring, v_bonus, v_units) returning * into r;
    end if;
    v_ids := v_ids || r.id;

    if v_kind = 'special' then
      v_mode := public.round_special_mode(v_scoring);
      perform public.drop_round_units(r.id, v_units);
      for team in select * from public.episode_teams where round_id = r.id and heat_number is not null and scoring_mode <> v_mode loop
        perform public.save_special_dance(ep.id, p_actor_id, jsonb_build_object('id', team.id, 'scoringMode', v_mode));
      end loop;
      update public.episode_teams set dance_type = v_type, updated_at = now()
      where round_id = r.id and heat_number is not null and dance_type <> v_type;
      for team in select * from public.episode_teams where round_id = r.id and heat_number is not null and name_is_auto order by heat_number loop
        v_name := public.round_heat_name(v_type, team.heat_number, v_units);
        if team.name <> v_name and not exists (select 1 from public.episode_teams o
            where o.episode_id = ep.id and lower(o.name) = lower(v_name) and o.id <> team.id) then
          update public.episode_teams set name = v_name, updated_at = now() where id = team.id;
        end if;
      end loop;
      if v_round ? 'heats' then
        for v_heat in select * from jsonb_array_elements(v_round->'heats') loop
          v_k := nullif(v_heat->>'heatNumber', '')::int;
          if v_k is null or v_k not between 1 and v_units then raise exception 'A heat of % is numbered 1 to %', v_type, v_units; end if;
          select * into team from public.episode_teams where round_id = r.id and heat_number = v_k;
          if jsonb_array_length(coalesce(v_heat->'coupleIds', '[]'::jsonb)) = 0 then
            if team.id is not null then perform public.drop_round_unit(team.id); end if;
          elsif team.id is not null then
            perform public.save_special_dance(ep.id, p_actor_id, jsonb_build_object('id', team.id, 'memberCoupleIds', v_heat->'coupleIds'));
          else
            v_new := public.save_special_dance(ep.id, p_actor_id, jsonb_build_object(
              'danceType', v_type, 'name', public.round_heat_name(v_type, v_k, v_units),
              'memberCoupleIds', v_heat->'coupleIds', 'scoringMode', v_mode,
              'roundId', r.id, 'heatNumber', v_k, 'sortOrder', v_pos * 100 + v_k));
            update public.episode_teams set name_is_auto = true where id = v_new;
          end if;
        end loop;
      end if;
      update public.episode_teams set sort_order = v_pos * 100 + coalesce(heat_number, 99), updated_at = now()
      where round_id = r.id and ep.results_published_at is null and sort_order <> v_pos * 100 + coalesce(heat_number, 99);
      perform public.refresh_round_points(r.id, p_actor_id);
    end if;
  end loop;
  set constraints public.episode_rounds_position_key immediate;

  -- A draft dance's dance_slot is its own round's place among the own rounds,
  -- so removing or reordering them renumbers the saved dances with them.
  select coalesce(array_agg(id order by position), '{}') into v_new_own from public.episode_rounds where episode_id = ep.id and kind = 'own';
  if v_old_own is distinct from v_new_own[1:cardinality(v_old_own)] then
    if ep.results_published_at is not null then
      raise exception 'A published week''s own rounds can''t be removed or reordered';
    end if;
    select v_old_names[was.slot] into v_moved from unnest(v_old_own) with ordinality was(id, slot)
      where was.id <> all (v_new_own)
        and exists (select 1 from public.draft_dance_scores d where d.episode_id = ep.id and d.dance_slot = was.slot)
      limit 1;
    if found then
      raise exception '% has saved dances. Clear them on Enter Results first', v_moved;
    end if;
    if exists (select 1 from public.draft_dance_scores where episode_id = ep.id and dance_slot is null) then
      raise exception 'Some dances on this week were saved before rounds were tracked, so its rounds can''t move. Clear them on Enter Results first';
    end if;
    update public.draft_dance_scores d set dance_slot = m.new_slot
    from (select was.slot as old_slot, now_at.slot as new_slot
          from unnest(v_old_own) with ordinality was(id, slot)
          join unnest(v_new_own) with ordinality now_at(id, slot) on now_at.id = was.id
          where was.slot <> now_at.slot) m
    where d.episode_id = ep.id and d.dance_slot = m.old_slot;
    -- Enter Results rebuilds its rows when this changes, so an open page
    -- picks the new slots up instead of saving the old ones back.
    update public.draft_episode_overrides set updated_at = now() where episode_id = ep.id;
  end if;

  -- Exceptions once every round exists, since Withdrawn spans them all.
  for i in 1 .. jsonb_array_length(p_rounds) loop
    v_round := p_rounds->(i - 1);
    continue when not (v_round ? 'exceptions');
    for v_old in select * from public.episode_round_exceptions e where e.round_id = v_ids[i]
        and not exists (select 1 from jsonb_array_elements(v_round->'exceptions') n where (n->>'coupleId')::uuid = e.couple_id) loop
      if ep.results_published_at is not null then raise exception 'Exceptions on a published week change in a correction on Enter Results'; end if;
      perform public.apply_round_exception(ep.id, p_actor_id, v_old.couple_id, array[v_ids[i]], null, null, null);
    end loop;
    for x in select * from jsonb_array_elements(v_round->'exceptions') loop
      continue when exists (select 1 from public.episode_round_exceptions e where e.round_id = v_ids[i]
        and e.couple_id = (x->>'coupleId')::uuid and e.kind = x->>'kind'
        and e.note is not distinct from nullif(btrim(coalesce(x->>'note', '')), '')
        and e.bonus_points is not distinct from nullif(x->>'bonusPoints', '')::numeric);
      if ep.results_published_at is not null then raise exception 'Exceptions on a published week change in a correction on Enter Results'; end if;
      perform public.apply_round_exception(ep.id, p_actor_id, (x->>'coupleId')::uuid, array[v_ids[i]],
        x->>'kind', x->>'note', nullif(x->>'bonusPoints', '')::numeric);
    end loop;
  end loop;

  update public.episodes set expected_dance_count =
    (select count(*) from public.episode_rounds where episode_id = ep.id and kind = 'own')
  where id = ep.id;
  delete from public.episode_round_types where episode_id = ep.id;
  insert into public.episode_round_types (episode_id, round_type_id)
  select ep.id, rt.id from public.round_types rt
  where exists (select 1 from public.episode_rounds er where er.episode_id = ep.id and lower(btrim(er.round_type)) = lower(btrim(rt.name)));
  return to_jsonb(v_ids);
end $$;

revoke all on function public.save_episode_rounds(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_rounds(uuid, uuid, jsonb) to service_role;
