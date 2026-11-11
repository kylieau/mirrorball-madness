-- Curtain Call's Finale podium (Kylie, 2026-11-11): nobody goes home in the
-- week marked Finale, so its elimination pick becomes three picks, Winner,
-- Runner-Up and Third Place, saved through submit_podium_prediction.
-- Additive and safe with the previous app build, except that submit_prediction
-- now refuses an elimination pick for the Finale week. Changes no stored pick
-- and recomputes nothing. Safe to apply again.
begin;

alter table public.predictions add column if not exists predicted_winner_couple_id uuid references public.couples(id);
alter table public.predictions add column if not exists predicted_runner_up_couple_id uuid references public.couples(id);
alter table public.predictions add column if not exists predicted_third_place_couple_id uuid references public.couples(id);

create or replace function public.submit_prediction(
  p_league_id uuid,
  p_week_id uuid,
  p_predicted_eliminated_couple_id uuid,
  p_predicted_eliminated_couple_id_2 uuid,
  p_predicted_top_scorer_couple_id uuid
)
returns public.predictions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_lock_at timestamptz;
  v_week public.competition_weeks;
  v_prediction public.predictions;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and eliminations_category_enabled
  ) then
    raise exception 'Curtain Call is not enabled for this league';
  end if;

  select * into v_week from public.competition_weeks where id = p_week_id;

  if not found then
    raise exception 'Week not found';
  end if;

  if v_week.is_finale then
    if p_predicted_eliminated_couple_id is not null or p_predicted_eliminated_couple_id_2 is not null then
      raise exception 'Nobody goes home in the Finale: pick the podium instead';
    end if;
  elsif v_week.is_double_elimination_week then
    if (p_predicted_eliminated_couple_id is null) <> (p_predicted_eliminated_couple_id_2 is null) then
      raise exception 'Pick both couples going home this week, or leave both blank to skip';
    end if;
    if p_predicted_eliminated_couple_id_2 is not null
       and p_predicted_eliminated_couple_id_2 = p_predicted_eliminated_couple_id then
      raise exception 'Pick two different couples for your double elimination guesses';
    end if;
  elsif p_predicted_eliminated_couple_id_2 is not null then
    raise exception 'This week is not a double elimination week';
  end if;

  v_lock_at := public.prediction_lock_at(p_league_id, p_week_id);

  if now() >= v_lock_at then
    raise exception 'Predictions are locked for this week';
  end if;

  -- A podium saved for this week is left alone: only submit_podium_prediction
  -- writes those columns, and a top-scorer-only save from an older build must
  -- not wipe them.
  insert into public.predictions (
    league_id, manager_id, week_id,
    predicted_eliminated_couple_id, predicted_eliminated_couple_id_2,
    predicted_top_scorer_couple_id, entered_by, entered_via, pick_made_at
  )
  values (
    p_league_id, v_acting_manager, p_week_id,
    p_predicted_eliminated_couple_id, p_predicted_eliminated_couple_id_2,
    p_predicted_top_scorer_couple_id, auth.uid(), 'app', now()
  )
  on conflict (league_id, manager_id, week_id) do update set
    predicted_eliminated_couple_id = excluded.predicted_eliminated_couple_id,
    predicted_eliminated_couple_id_2 = excluded.predicted_eliminated_couple_id_2,
    predicted_top_scorer_couple_id = excluded.predicted_top_scorer_couple_id,
    submitted_at = now(), entered_by = auth.uid(), entered_via = 'app', entry_reason = null, pick_made_at = now()
  returning * into v_prediction;

  return v_prediction;
end;
$$;

revoke execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.submit_prediction(uuid, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.submit_podium_prediction(
  p_league_id uuid,
  p_week_id uuid,
  p_winner uuid,
  p_runner_up uuid,
  p_third uuid,
  p_top_scorer uuid
)
returns public.predictions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_week public.competition_weeks;
  v_prediction public.predictions;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and eliminations_category_enabled
  ) then
    raise exception 'Curtain Call is not enabled for this league';
  end if;

  select * into v_week from public.competition_weeks where id = p_week_id;

  if not found then
    raise exception 'Week not found';
  end if;

  if not v_week.is_finale then
    raise exception 'Only the Finale takes a podium pick';
  end if;

  if num_nonnulls(p_winner, p_runner_up, p_third) not in (0, 3) then
    raise exception 'Pick all three podium places, or leave them blank to skip';
  end if;
  if p_winner = p_runner_up or p_winner = p_third or p_runner_up = p_third then
    raise exception 'Pick three different couples for the podium';
  end if;
  if exists (
    select 1 from unnest(array[p_winner, p_runner_up, p_third, p_top_scorer]) as picked(couple_id)
    where picked.couple_id is not null and not exists (
      select 1 from public.couples where id = picked.couple_id and season_id = v_week.season_id
    )
  ) then
    raise exception 'Couple is not in this season';
  end if;

  if now() >= public.prediction_lock_at(p_league_id, p_week_id) then
    raise exception 'Predictions are locked for this week';
  end if;

  insert into public.predictions (
    league_id, manager_id, week_id,
    predicted_winner_couple_id, predicted_runner_up_couple_id, predicted_third_place_couple_id,
    predicted_top_scorer_couple_id, entered_by, entered_via, pick_made_at
  )
  values (
    p_league_id, v_acting_manager, p_week_id,
    p_winner, p_runner_up, p_third,
    p_top_scorer, auth.uid(), 'app', now()
  )
  on conflict (league_id, manager_id, week_id) do update set
    predicted_eliminated_couple_id = null,
    predicted_eliminated_couple_id_2 = null,
    predicted_winner_couple_id = excluded.predicted_winner_couple_id,
    predicted_runner_up_couple_id = excluded.predicted_runner_up_couple_id,
    predicted_third_place_couple_id = excluded.predicted_third_place_couple_id,
    predicted_top_scorer_couple_id = excluded.predicted_top_scorer_couple_id,
    submitted_at = now(), entered_by = auth.uid(), entered_via = 'app', entry_reason = null, pick_made_at = now()
  returning * into v_prediction;

  return v_prediction;
end;
$$;

revoke all on function public.submit_podium_prediction(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.submit_podium_prediction(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

-- The backfill follows the same split: the existing function refuses an
-- elimination pick for the Finale week, and a second one records a podium.
create or replace function public.admin_backfill_prediction(
  p_league_id uuid,p_week_id uuid,p_manager_id uuid,p_elimination uuid,p_elimination_2 uuid,p_top_scorer uuid,p_pick_made_at timestamptz,p_reason text
) returns public.predictions language plpgsql security definer set search_path = '' as $$
declare result public.predictions; week public.competition_weeks; couple uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_super_admin) then raise exception 'Only a site admin can record a backfill'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 or p_pick_made_at is null or p_pick_made_at > now() then raise exception 'Record when the pick was made and why it is being backfilled'; end if;
  if not exists(select 1 from public.league_members where league_id=p_league_id and user_id=p_manager_id) then raise exception 'Manager is not in this league'; end if;
  select * into strict week from public.competition_weeks where id=p_week_id;
  if p_pick_made_at >= public.prediction_lock_at(p_league_id,p_week_id) then raise exception 'That pick was made after this week''s lock, so it can''t be recorded'; end if;
  foreach couple in array array[p_elimination,p_elimination_2,p_top_scorer] loop
    if couple is not null and not exists(select 1 from public.couples where id=couple and season_id=week.season_id) then raise exception 'Couple is not in this season'; end if;
  end loop;
  if week.is_finale and (p_elimination is not null or p_elimination_2 is not null) then raise exception 'Nobody goes home in the Finale: record the podium instead'; end if;
  if (not week.is_double_elimination_week and p_elimination_2 is not null)
    or (week.is_double_elimination_week and ((p_elimination is null) <> (p_elimination_2 is null)))
    or (p_elimination is not null and p_elimination=p_elimination_2) then raise exception 'Invalid elimination selections for this week'; end if;
  insert into public.predictions(league_id,manager_id,week_id,predicted_eliminated_couple_id,predicted_eliminated_couple_id_2,predicted_top_scorer_couple_id,submitted_at,entered_by,entered_via,entry_reason,pick_made_at)
  values(p_league_id,p_manager_id,p_week_id,p_elimination,p_elimination_2,p_top_scorer,now(),auth.uid(),'admin_backfill',btrim(p_reason),p_pick_made_at)
  on conflict(league_id,manager_id,week_id) do update set predicted_eliminated_couple_id=excluded.predicted_eliminated_couple_id,predicted_eliminated_couple_id_2=excluded.predicted_eliminated_couple_id_2,predicted_top_scorer_couple_id=excluded.predicted_top_scorer_couple_id,submitted_at=excluded.submitted_at,entered_by=excluded.entered_by,entered_via=excluded.entered_via,entry_reason=excluded.entry_reason,pick_made_at=excluded.pick_made_at
  returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_backfill_prediction(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_backfill_prediction(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) to authenticated;

create or replace function public.admin_backfill_podium_prediction(
  p_league_id uuid,p_week_id uuid,p_manager_id uuid,p_winner uuid,p_runner_up uuid,p_third uuid,p_top_scorer uuid,p_pick_made_at timestamptz,p_reason text
) returns public.predictions language plpgsql security definer set search_path = '' as $$
declare result public.predictions; week public.competition_weeks; couple uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_super_admin) then raise exception 'Only a site admin can record a backfill'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 or p_pick_made_at is null or p_pick_made_at > now() then raise exception 'Record when the pick was made and why it is being backfilled'; end if;
  if not exists(select 1 from public.league_members where league_id=p_league_id and user_id=p_manager_id) then raise exception 'Manager is not in this league'; end if;
  select * into strict week from public.competition_weeks where id=p_week_id;
  if not week.is_finale then raise exception 'Only the Finale takes a podium pick'; end if;
  if p_pick_made_at >= public.prediction_lock_at(p_league_id,p_week_id) then raise exception 'That pick was made after this week''s lock, so it can''t be recorded'; end if;
  foreach couple in array array[p_winner,p_runner_up,p_third,p_top_scorer] loop
    if couple is not null and not exists(select 1 from public.couples where id=couple and season_id=week.season_id) then raise exception 'Couple is not in this season'; end if;
  end loop;
  if num_nonnulls(p_winner,p_runner_up,p_third) not in (0,3)
    or p_winner=p_runner_up or p_winner=p_third or p_runner_up=p_third then raise exception 'Invalid podium selections for the Finale'; end if;
  insert into public.predictions(league_id,manager_id,week_id,predicted_winner_couple_id,predicted_runner_up_couple_id,predicted_third_place_couple_id,predicted_top_scorer_couple_id,submitted_at,entered_by,entered_via,entry_reason,pick_made_at)
  values(p_league_id,p_manager_id,p_week_id,p_winner,p_runner_up,p_third,p_top_scorer,now(),auth.uid(),'admin_backfill',btrim(p_reason),p_pick_made_at)
  on conflict(league_id,manager_id,week_id) do update set predicted_eliminated_couple_id=null,predicted_eliminated_couple_id_2=null,predicted_winner_couple_id=excluded.predicted_winner_couple_id,predicted_runner_up_couple_id=excluded.predicted_runner_up_couple_id,predicted_third_place_couple_id=excluded.predicted_third_place_couple_id,predicted_top_scorer_couple_id=excluded.predicted_top_scorer_couple_id,submitted_at=excluded.submitted_at,entered_by=excluded.entered_by,entered_via=excluded.entered_via,entry_reason=excluded.entry_reason,pick_made_at=excluded.pick_made_at
  returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_backfill_podium_prediction(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_backfill_podium_prediction(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) to authenticated;

commit;
