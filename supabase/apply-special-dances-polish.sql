-- Applied live 2026-11-04 (verified from the live function bodies).
-- apply-whole-judge-marks.sql supersedes its save_team_marks and
-- check_team_mark but not its save_special_dance_points.
--
-- What this changes (no Week 8 row rewrites, no table drops):
-- 1. save_team_marks and save_special_dance_points no longer insert
--    draft_episode_overrides, so scoring a special cannot flip a Not started
--    week into an empty Draft.
-- 2. Judge marks must be 1 to the dance's max in steps of 0.5 (0 is refused).
--    The table's 0..10 check is left alone so existing rows stay valid.
--
-- Reruns are safe (create or replace / drop trigger if exists).

create or replace function public.check_team_mark() returns trigger language plpgsql set search_path = '' as $$
declare v_max numeric;
begin
  select mark_max into v_max from public.episode_teams where id = new.team_id;
  if new.score < 1 or new.score > coalesce(v_max, 10) or new.score * 2 <> trunc(new.score * 2) then
    raise exception 'Judge scores must be 1 to % in steps of 0.5', coalesce(v_max, 10);
  end if;
  return new;
end $$;
drop trigger if exists episode_team_marks_range on public.episode_team_marks;
create trigger episode_team_marks_range before insert or update on public.episode_team_marks
  for each row execute function public.check_team_mark();

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
    if v_score is null or v_score < 1 or v_score > team.mark_max or v_score * 2 <> trunc(v_score * 2) then
      raise exception 'Judge scores must be 1 to % in steps of 0.5', team.mark_max;
    end if;
    if not ((mark->>'judgeId')::uuid = any(v_panel)) then raise exception 'Marks must be for this dance''s judges'; end if;
  end loop;
  delete from public.episode_team_marks where team_id = team.id;
  insert into public.episode_team_marks (team_id, judge_id, score, updated_by)
  select team.id, (m->>'judgeId')::uuid, (m->>'score')::numeric, p_actor_id from jsonb_array_elements(p_marks) m;
  update public.episode_teams set updated_at = now() where id = team.id;
end;
$$;
revoke all on function public.save_team_marks(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_team_marks(uuid, uuid, uuid, jsonb) to service_role;

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
end;
$$;
revoke all on function public.save_special_dance_points(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_special_dance_points(uuid, uuid, uuid, jsonb) to service_role;
