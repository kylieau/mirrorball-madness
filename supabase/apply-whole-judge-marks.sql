-- Applied live 2026-11-04 (constraints and save_team_marks verified).
--
-- Judge marks are whole numbers from 1 to 10, for couples and special dances
-- alike, and every special dance is out of 10 on the night's judges.
--
-- 1. judge_scores, draft_judge_scores and episode_team_marks each get one
--    whole_mark check (1 to 10, no half points), replacing the 0..10 range
--    checks and the per-dance check_team_mark trigger. Every row on the live
--    project already passes (probed 2026-11-04: 353 live, 297 draft, 8 special
--    marks), so the checks are validated, not added "not valid".
-- 2. save_team_marks refuses with the app's own message (src/lib/judge-marks.ts).
--    save_episode_draft_checked keeps its older "between 0 and 10" wording: the
--    app checks first, so that message is never reached and the check above is
--    the backstop.
-- 3. episode_teams_night_panel pins mark_max to 10 and panel_judge_ids to null
--    (the night's panel), which every existing dance already has. The app no
--    longer offers "Out of" or a per-dance panel.
--
-- Deploy the app first: an older tab offering "Out of" would hit check 3.
-- Runs after apply-special-dances-polish.sql. Safe to rerun.
begin;

do $$ declare t text; begin
  foreach t in array array['judge_scores', 'draft_judge_scores', 'episode_team_marks'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_score_range');
    if not exists (select 1 from pg_catalog.pg_constraint where conname = t || '_whole_mark') then
      execute format('alter table public.%I add constraint %I check (score between 1 and 10 and score = trunc(score))', t, t || '_whole_mark');
    end if;
  end loop;
end $$;
alter table public.episode_team_marks drop constraint if exists episode_team_marks_score_check;
drop trigger if exists episode_team_marks_range on public.episode_team_marks;
drop function if exists public.check_team_mark();

do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'episode_teams_night_panel') then
    alter table public.episode_teams add constraint episode_teams_night_panel check (mark_max = 10 and panel_judge_ids is null);
  end if;
end $$;

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
    raise exception '% needs 2 to 4 judges and this night has %. Set the guest judge on Schedule first.', public.special_dance_label(team), cardinality(v_panel);
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > cardinality(v_panel) then
    raise exception 'Marks must be a list of at most %', cardinality(v_panel);
  end if;
  for mark in select * from jsonb_array_elements(p_marks) loop
    v_score := nullif(mark->>'score', '')::numeric;
    if v_score is null or v_score not between 1 and 10 or v_score <> trunc(v_score) then
      raise exception 'Judge scores must be whole numbers from 1 to 10.';
    end if;
    if not ((mark->>'judgeId')::uuid = any(v_panel)) then raise exception 'Marks must be for this night''s judges'; end if;
  end loop;
  delete from public.episode_team_marks where team_id = team.id;
  insert into public.episode_team_marks (team_id, judge_id, score, updated_by)
  select team.id, (m->>'judgeId')::uuid, (m->>'score')::numeric, p_actor_id from jsonb_array_elements(p_marks) m;
  update public.episode_teams set updated_at = now() where id = team.id;
end;
$$;
revoke all on function public.save_team_marks(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_team_marks(uuid, uuid, uuid, jsonb) to service_role;

commit;

-- After running, each should return one row per name:
--   select conname from pg_constraint where conname in
--     ('judge_scores_whole_mark', 'draft_judge_scores_whole_mark', 'episode_team_marks_whole_mark', 'episode_teams_night_panel');
-- and this none:
--   select tgname from pg_trigger where tgname = 'episode_team_marks_range';
