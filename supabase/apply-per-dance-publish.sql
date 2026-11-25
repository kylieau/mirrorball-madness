-- Enter Results publishes one dance at a time (Kylie, 2026-11-24): each of a
-- couple's own dances, one per round, has its own Publish, Undo and Un-Post,
-- and the couple's other rounds stay editable while some are posted.
--
-- A draft dance links to the live row its post wrote (live_dance_score_id),
-- so un-posting removes only that dance. While a couple has posted dances, a
-- draft save keeps the posted ones as they are (they must arrive unchanged,
-- matched by round slot, or the couple's save is skipped as before) and saves
-- the rest. commit_dance_reveal posts or un-posts one dance by couple and
-- slot. Finish Week names a dance still to publish.
--
-- The app before this change still posts a whole couple through
-- commit_episode_reveal, which now links what it writes, and couples already
-- posted are linked below by matching each dance, so this can go in first.
-- Safe to run again.

begin;

alter table public.draft_dance_scores
  add column if not exists live_dance_score_id uuid references public.dance_scores(id) on delete set null;
create unique index if not exists draft_dance_scores_live_dance_score_id_key
  on public.draft_dance_scores (live_dance_score_id) where live_dance_score_id is not null;

-- Couples posted before this file: link each draft dance to the live row
-- with the same style, song and marks.
do $$ declare d record; v_live uuid; begin
  for d in select dd.* from public.draft_dance_scores dd join public.episodes e on e.id = dd.episode_id
      where e.results_published_at is null and dd.live_dance_score_id is null order by dd.dance_slot nulls last, dd.id loop
    select l.id into v_live from public.dance_scores l
    where l.episode_id = d.episode_id and l.couple_id = d.couple_id and l.team_id is null
      and l.dance_style_id = d.dance_style_id and coalesce(l.song_title, '') = coalesce(d.song_title, '')
      and not exists (select 1 from public.draft_dance_scores o where o.live_dance_score_id = l.id)
      and (select coalesce(jsonb_agg(jsonb_build_array(j.judge_id, j.score) order by j.judge_id), '[]'::jsonb) from public.judge_scores j where j.dance_score_id = l.id)
        = (select coalesce(jsonb_agg(jsonb_build_array(j.judge_id, j.score) order by j.judge_id), '[]'::jsonb) from public.draft_judge_scores j where j.draft_dance_score_id = d.id)
    order by l.created_at, l.id limit 1;
    if v_live is not null then update public.draft_dance_scores set live_dance_score_id = v_live where id = d.id; end if;
  end loop;
end $$;

-- A dance saved before slots has none, and Enter Results shows it in the
-- couple's first empty round; store that round so it can be posted and
-- un-posted on its own.
do $$ declare d record; v_slot smallint; begin
  for d in select dd.id, dd.episode_id, dd.couple_id from public.draft_dance_scores dd join public.episodes e on e.id = dd.episode_id
      where e.results_published_at is null and dd.dance_slot is null order by dd.episode_id, dd.couple_id, dd.created_at, dd.id loop
    select min(n)::smallint into v_slot from generate_series(1, 12) n
    where not exists (select 1 from public.draft_dance_scores o where o.episode_id = d.episode_id and o.couple_id = d.couple_id and o.dance_slot = n);
    update public.draft_dance_scores set dance_slot = v_slot where id = d.id;
  end loop;
end $$;

create or replace function public.save_episode_draft_checked(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ep public.episodes; actor public.profiles; entry jsonb; dance jsonb; js jsonb;
  couple uuid; draft_id uuid; total numeric; count_scores int; token uuid; base timestamptz;
  v_acknowledged uuid[] := '{}'; v_skipped uuid[] := '{}'; v_incoming jsonb; v_posted smallint[]; v_write boolean;
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
    v_posted := '{}'; v_write := true;
    if ep.results_published_at is null and exists (select 1 from public.dance_scores where episode_id = ep.id and couple_id = couple and team_id is null) then
      if not exists (select 1 from public.dance_scores l where l.episode_id = ep.id and l.couple_id = couple and l.team_id is null
          and not exists (select 1 from public.draft_dance_scores p where p.live_dance_score_id = l.id and p.dance_slot is not null)) then
        -- Every posted dance is linked to its draft by round slot: those must
        -- arrive unchanged, and the couple's other rounds save as usual.
        if exists (select 1 from public.draft_dance_scores p where p.episode_id = ep.id and p.couple_id = couple and p.live_dance_score_id is not null
            and not exists (select 1 from jsonb_array_elements(coalesce(entry->'dances', '[]'::jsonb)) d
              where (d->>'slot')::smallint = p.dance_slot and (d->>'danceStyleId')::uuid = p.dance_style_id
                and coalesce(d->>'songTitle', '') = coalesce(p.song_title, '')
                and (select coalesce(jsonb_agg(jsonb_build_array((j->>'judgeId')::uuid, (j->>'score')::numeric) order by (j->>'judgeId')::uuid), '[]'::jsonb)
                     from jsonb_array_elements(d->'judgeScores') j)
                  = (select coalesce(jsonb_agg(jsonb_build_array(js.judge_id, js.score) order by js.judge_id), '[]'::jsonb)
                     from public.draft_judge_scores js where js.draft_dance_score_id = p.id))) then
          v_skipped := v_skipped || couple;
          v_write := false;
        else
          select coalesce(array_agg(dance_slot), '{}') into v_posted from public.draft_dance_scores
          where episode_id = ep.id and couple_id = couple and live_dance_score_id is not null;
        end if;
      else
        -- Posted without links to their rounds: the whole couple's dances
        -- must match their draft, as before.
        v_write := false;
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
      end if;
    end if;
    if v_write then
      delete from public.draft_dance_scores where episode_id = ep.id and couple_id = couple and live_dance_score_id is null;
      for dance in select * from jsonb_array_elements(entry->'dances') loop
        continue when (dance->>'slot')::smallint = any(v_posted);
        total := 0; count_scores := 0;
        for js in select * from jsonb_array_elements(dance->'judgeScores') loop
          if (js->>'score')::numeric not between 0 and 10 then raise exception 'Judge scores must be between 0 and 10'; end if;
          total := total + (js->>'score')::numeric; count_scores := count_scores + 1;
        end loop;
        insert into public.draft_dance_scores (episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score, dance_slot)
        values (ep.id, couple, (dance->>'danceStyleId')::uuid, dance->>'songTitle', total, case when count_scores = 0 then 0 else total / count_scores * 3 end, (dance->>'slot')::smallint) returning id into draft_id;
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
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;
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
      update public.draft_dance_scores set live_dance_score_id=live_id where id=dance.id;
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

-- Posts or un-posts one of a couple's own dances: the draft dance in that
-- round slot. Its live row is linked from the draft, so un-posting removes
-- only that dance and the couple's other posted dances keep their rows.
create or replace function public.commit_dance_reveal(p_episode_id uuid, p_couple_id uuid, p_slot smallint, p_actor_id uuid, p_snapshot jsonb, p_plan jsonb, p_undo boolean)
returns void language plpgsql set search_path = '' set lock_timeout = '5s' as $function$
declare ep public.episodes; dance public.draft_dance_scores; live_id uuid;
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
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;
  if not exists(select 1 from public.profiles where id=p_actor_id and is_super_admin) then raise exception 'Not authorized to publish scores'; end if;
  select * into strict ep from public.episodes where id=p_episode_id;
  if ep.results_published_at is not null then raise exception 'This episode is already published'; end if;
  perform public.assert_special_dance_plan(ep.id, p_plan);
  if p_snapshot->>'_revision' is null or p_snapshot->>'_revision' is distinct from public.episode_publication_snapshot(ep.id)->>'_revision' then
    raise exception 'Results or scoring inputs changed. Refresh and try again.';
  end if;
  if (select count(*) from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id and dance_slot=p_slot) <> 1 then
    raise exception 'No saved dance in that round for this couple. Refresh and try again.';
  end if;
  select * into strict dance from public.draft_dance_scores where episode_id=ep.id and couple_id=p_couple_id and dance_slot=p_slot;
  if p_undo then
    if dance.live_dance_score_id is null then raise exception 'That dance isn''t posted'; end if;
    delete from public.dance_scores where id=dance.live_dance_score_id;
  else
    if dance.live_dance_score_id is not null then raise exception 'That dance is already posted'; end if;
    if exists(select 1 from public.dance_scores l where l.episode_id=ep.id and l.couple_id=p_couple_id and l.team_id is null
        and not exists(select 1 from public.draft_dance_scores d where d.live_dance_score_id=l.id)) then
      raise exception 'This couple''s posted dances aren''t linked to their rounds. Un-Post them and publish each dance again.';
    end if;
    if not exists(select 1 from public.draft_judge_scores where draft_dance_score_id=dance.id) then raise exception 'Complete the judge scores before posting'; end if;
    insert into public.dance_scores(episode_id,couple_id,dance_style_id,song_title,total_score,scaled_score)
    select ep.id,p_couple_id,dance.dance_style_id,dance.song_title,sum(score),avg(score)*3
    from public.draft_judge_scores where draft_dance_score_id=dance.id returning id into live_id;
    insert into public.judge_scores(dance_score_id,judge_id,score)
    select live_id,judge_id,score from public.draft_judge_scores where draft_dance_score_id=dance.id;
    update public.draft_dance_scores set live_dance_score_id=live_id where id=dance.id;
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
  v_slot smallint;
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
    public.episode_team_marks, public.episode_team_scores, public.episode_team_couple_marks in share row exclusive mode;

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
  select p.name, d.dance_slot into v_celebrity, v_slot from public.draft_dance_scores d
    join public.couples c on c.id = d.couple_id join public.people p on p.id = c.celebrity_id
  where d.episode_id = p_episode_id and d.couple_id = any(v_preserved) and d.live_dance_score_id is null
  order by p.name, d.dance_slot limit 1;
  if found then
    raise exception 'Publish every dance before finishing the week: %''s % is still to publish.', v_celebrity,
      coalesce((select round_type from public.episode_rounds r where r.episode_id = p_episode_id and r.kind = 'own'
        order by r.position offset v_slot - 1 limit 1), 'dance');
  end if;
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

revoke all on function public.save_episode_draft_checked(jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_draft_checked(jsonb) to service_role;
revoke all on function public.commit_episode_reveal(uuid, uuid, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.commit_episode_reveal(uuid, uuid, uuid, jsonb, jsonb, boolean) to service_role;
revoke all on function public.commit_dance_reveal(uuid, uuid, smallint, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.commit_dance_reveal(uuid, uuid, smallint, uuid, jsonb, jsonb, boolean) to service_role;
revoke all on function public.commit_episode_publication(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_episode_publication(uuid, uuid, jsonb, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';
