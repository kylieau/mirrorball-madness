-- Curtain Call backfill: refuse a pick made at or after that week's lock
-- (prediction_lock_at for the league), so the form can only recover picks made in time.
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
