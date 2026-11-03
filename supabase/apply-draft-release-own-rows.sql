-- Releasing a couple's draft ignores a posted special dance.
--
-- set_draft_couple_release refused a couple as "already live" whenever any
-- dance_scores row existed for it that night, including the team_id-tagged
-- row a posted special dance writes. Only the couple's own live dances
-- (team_id is null) make it live, the same rule commit_episode_reveal and
-- save_episode_draft_checked already use.
--
-- Needs apply-team-dance-entity.sql (dance_scores.team_id). Function body only:
-- no table or row changes. Safe to rerun.

create or replace function public.set_draft_couple_release(p_episode_id uuid,p_couple_id uuid,p_actor_id uuid,p_release boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_episode_draft_actor(p_episode_id,p_actor_id);
  if exists(select 1 from public.episodes where id=p_episode_id and results_published_at is not null) then raise exception 'This episode is already published'; end if;
  if p_release then
    -- A posted special dance (team_id) is not the couple's own dance going live.
    if exists(select 1 from public.dance_scores where episode_id=p_episode_id and couple_id=p_couple_id and team_id is null) then raise exception 'This couple is already live'; end if;
    if not exists(select 1 from public.draft_dance_scores where episode_id=p_episode_id and couple_id=p_couple_id)
      or exists(select 1 from public.draft_dance_scores d where d.episode_id=p_episode_id and d.couple_id=p_couple_id and not exists(select 1 from public.draft_judge_scores where draft_dance_score_id=d.id)) then raise exception 'Complete the saved judge scores before releasing'; end if;
    insert into public.draft_couple_releases(episode_id,couple_id,released_by) values(p_episode_id,p_couple_id,p_actor_id)
    on conflict(episode_id,couple_id) do update set released_at=now(),released_by=p_actor_id;
  else delete from public.draft_couple_releases where episode_id=p_episode_id and couple_id=p_couple_id;
  end if;
end;
$$;
revoke all on function public.set_draft_couple_release(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_draft_couple_release(uuid,uuid,uuid,boolean) to service_role;
