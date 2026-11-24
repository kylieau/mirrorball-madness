-- A couple's draft dance remembers which of its own rounds it is.
--
-- Enter Results shows one slot per own round (Round 1 Individual, Round 2
-- Instant, Round 3 Freestyle). A draft save skips a slot with no style, so
-- the rows saved never said which slot they came from, and a reload stacked
-- them from Round 1: a Freestyle saved alone came back under Round 1.
-- dance_slot is the slot (1 = Round 1's dance), sent by the app with each
-- dance. A save without it (the app before this change) writes null, which
-- loads the old way, so this can go in before the new app is deployed.
--
-- Live dance_scores and the correction seed are unchanged: a published or
-- posted dance has no slot, and its draft copy loads in saved order as before.
-- Safe to rerun.

alter table public.draft_dance_scores add column if not exists dance_slot smallint check (dance_slot between 1 and 12);

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
revoke all on function public.save_episode_draft_checked(jsonb) from public, anon, authenticated;
grant execute on function public.save_episode_draft_checked(jsonb) to service_role;
