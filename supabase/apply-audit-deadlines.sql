-- Mirrorball Madness. Apply after apply-audit-security.sql, before the associated app deployment.
-- Preserves current expired deadlines and scoring exemptions; never rewrites historical picks.
begin;
alter table public.scoring_settings add column if not exists grand_finale_deadline_at timestamptz;
alter table public.scoring_settings add column if not exists grand_finale_deadline_season_id uuid references public.seasons(id);
create or replace function public.effective_grand_finale_deadline(p_league_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select grand_finale_deadline_at from public.scoring_settings where league_id=p_league_id and grand_finale_deadline_season_id=public.active_season_id()),
    (select min(e.airs_at)
  from public.episodes e
  join public.competition_weeks w on w.id = e.week_id
  where w.season_id = public.active_season_id()
    and w.week_number = public.effective_hard_deadline_week(p_league_id)));
$$;

create or replace function public.unlock_grand_finale_late(
  p_league_id uuid,
  p_manager_id uuid,
  p_late_factor numeric,
  p_acknowledge_resolved boolean
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_deadline timestamptz;
  v_factor numeric(3,2);
  v_submitted timestamptz;
  v_resolved boolean;
begin
  if not (
    public.is_league_commissioner(p_league_id)
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)
  ) then
    raise exception 'Only a commissioner or a super admin can allow a late Grand Finale';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and bonus_picks_category_enabled
  ) then
    raise exception 'Grand Finale is not enabled for this league';
  end if;

  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_manager_id
  ) then
    raise exception 'That person is not a manager in this league';
  end if;

  if p_manager_id = public.resolve_acting_league_member(p_league_id) then raise exception 'You cannot allow a late entry for your own team'; end if;

  v_deadline := public.effective_grand_finale_deadline(p_league_id);
  if v_deadline is null or now() < v_deadline then
    raise exception 'Grand Finale predictions are not locked yet';
  end if;

  if p_late_factor is null then
    raise exception 'Late factor must be between 0 and 1';
  end if;
  v_factor := round(p_late_factor, 2);
  if v_factor < 0 or v_factor > 1 then
    raise exception 'Late factor must be between 0 and 1';
  end if;

  if exists (
    select 1 from public.grand_finale_predictions
    where league_id = p_league_id and manager_id = p_manager_id
  ) then
    raise exception 'This manager already has a Grand Finale bracket';
  end if;

  select submitted_at into v_submitted
  from public.grand_finale_late_unlocks
  where league_id = p_league_id and manager_id = p_manager_id;

  if found and v_submitted is not null then
    raise exception 'This manager already used their late Grand Finale entry';
  end if;

  select exists (
    select 1 from public.couples
    where season_id = public.active_season_id()
      and status in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place')
  ) into v_resolved;

  if v_resolved and not coalesce(p_acknowledge_resolved, false) then
    raise exception 'Confirm that resolved couples will not be paid';
  end if;

  insert into public.grand_finale_late_unlocks (league_id, manager_id, late_factor, unlocked_by)
  values (p_league_id, p_manager_id, v_factor, auth.uid())
  on conflict (league_id, manager_id) do update
    set late_factor = excluded.late_factor,
        unlocked_by = excluded.unlocked_by,
        unlocked_at = now()
    where public.grand_finale_late_unlocks.submitted_at is null;
end;
$$;

create or replace function public.submit_grand_finale_prediction(p_league_id uuid, p_couple_ids uuid[])
returns setof public.grand_finale_predictions
language plpgsql
security definer set search_path = ''
as $$
declare
  v_deadline timestamptz;
  v_season_id uuid;
  v_expected_count int;
  v_acting_manager uuid;
  v_late_open boolean := false;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and bonus_picks_category_enabled
  ) then
    raise exception 'Grand Finale is not enabled for this league';
  end if;

  v_deadline := public.effective_grand_finale_deadline(p_league_id);

  -- After the deadline, the only way through is a still-open late unlock.
  -- One submit stamps it. An already-locked bracket cannot be edited.
  if v_deadline is null or now() >= v_deadline then
    perform 1
    from public.grand_finale_late_unlocks
    where league_id = p_league_id
      and manager_id = v_acting_manager
      and submitted_at is null
    for update;

    if not found then
      raise exception 'Grand Finale predictions are locked';
    end if;

    if exists (
      select 1 from public.grand_finale_predictions
      where league_id = p_league_id and manager_id = v_acting_manager
    ) then
      raise exception 'A locked Grand Finale bracket can''t be edited';
    end if;

    if exists (select 1 from public.competition_weeks w where w.season_id=public.active_season_id()
      and exists(select 1 from public.episodes e where e.week_id=w.id and e.airs_at <= now())
      and exists(select 1 from public.episodes e where e.week_id=w.id and e.results_published_at is null)) then
      raise exception 'Wait until the current competition week is published before submitting a late bracket';
    end if;
    v_late_open := true;
  end if;

  v_season_id := public.active_season_id();

  select count(*) into v_expected_count from public.couples where season_id = v_season_id;

  if array_length(p_couple_ids, 1) is distinct from v_expected_count
     or (select count(distinct c) from unnest(p_couple_ids) as c) is distinct from v_expected_count
  then
    raise exception 'Prediction must include every couple this season, exactly once';
  end if;

  if exists (
    select 1 from unnest(p_couple_ids) as c
    where not exists (select 1 from public.couples where id = c and season_id = v_season_id)
  ) then
    raise exception 'Prediction includes a couple not in the current season';
  end if;

  delete from public.grand_finale_predictions
  where league_id = p_league_id and manager_id = v_acting_manager;

  return query
  insert into public.grand_finale_predictions (league_id, manager_id, couple_id, predicted_position)
  select p_league_id, v_acting_manager, c, ordinality
  from unnest(p_couple_ids) with ordinality as t(c, ordinality)
  returning *;

  if v_late_open then
    update public.grand_finale_late_unlocks
    set submitted_at = now(),
        ineligible_couple_ids = coalesce(
          (select array_agg(c.id)
           from public.couples c
           where c.season_id = v_season_id
             and c.status in ('eliminated', 'withdrawn', 'winner', 'runner_up', 'third_place')),
          '{}'::uuid[]
        )
    where league_id = p_league_id and manager_id = v_acting_manager;
  end if;
end;
$$;

create or replace function public.finalize_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
  v_league_id uuid;
  v_start_week int;
begin
  select league_id into v_league_id from public.waiver_claims where id=p_claim_id;
  perform 1 from public.leagues where id=v_league_id for update;
  select * into v_claim from public.waiver_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Recast not found';
  end if;

  if v_claim.status <> 'pending' then raise exception 'This recast has already been resolved'; end if;
  if not exists(select 1 from public.couples where id=v_claim.couple_id and season_id=public.active_season_id() and status='active')
    or exists(select 1 from public.roster_slots where league_id=v_claim.league_id and couple_id=v_claim.couple_id and end_week is null) then raise exception 'That couple is no longer available'; end if;
  if not exists(select 1 from public.roster_slots rs join public.couples c on c.id=rs.couple_id
    where rs.league_id=v_claim.league_id and rs.manager_id=v_claim.manager_id and rs.slot_number=v_claim.slot_number and rs.end_week is null and c.status in ('eliminated','withdrawn')) then raise exception 'That slot is no longer open for a recast'; end if;
  select min(w.week_number) into v_start_week from public.competition_weeks w where w.season_id=public.active_season_id()
    and (select min(e.airs_at) from public.episodes e where e.week_id=w.id)>now();
  if v_start_week is null then raise exception 'No upcoming competition week is scheduled'; end if;
  update public.waiver_claims set week_number=v_start_week-1 where id=p_claim_id returning * into v_claim;

  update public.roster_slots
  set end_week = v_claim.week_number
  where league_id = v_claim.league_id
    and manager_id = v_claim.manager_id
    and slot_number = v_claim.slot_number
    and end_week is null;

  insert into public.roster_slots (league_id, manager_id, slot_number, couple_id, source, start_week)
  values (v_claim.league_id, v_claim.manager_id, v_claim.slot_number, v_claim.couple_id, 'waiver', v_claim.week_number + 1);

  update public.waiver_claims
  set status = 'approved', resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  -- Other pending claims for the same couple (lost the bidding) or the same
  -- manager+slot (can't fill one slot twice) are now moot.
  update public.waiver_claims
  set status = 'rejected', resolved_at = now()
  where id <> p_claim_id
    and status = 'pending'
    and league_id = v_claim.league_id
    and (
      couple_id = v_claim.couple_id
      or (manager_id = v_claim.manager_id and slot_number = v_claim.slot_number)
    );

  return v_claim;
end;
$$;

create or replace function public.submit_waiver_claim(
  p_league_id uuid,
  p_slot_number int,
  p_couple_id uuid
)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_league public.leagues;
  v_current_week int;
  v_claim public.waiver_claims;
  v_acting_manager uuid;
begin
  v_acting_manager := public.resolve_acting_league_member(p_league_id);
  if v_acting_manager is null then
    raise exception 'You are not a member of this league';
  end if;

  -- Locks the league for the rest of this call, serializing concurrent
  -- claims for the same league so two FCFS claims for the same couple can't
  -- both see it as "available" at once.
  select * into v_league from public.leagues where id = p_league_id for update;

  if not exists (
    select 1 from public.scoring_settings
    where league_id = p_league_id and judges_score_category_enabled
  ) then
    raise exception 'Dance Card is not enabled for this league';
  end if;

  if v_league.waiver_mode <> 'waivers' then
    raise exception 'This league does not use Recast';
  end if;

  if not exists (
    select 1 from public.roster_slots rs
    join public.couples c on c.id = rs.couple_id
    where rs.league_id = p_league_id
      and rs.manager_id = v_acting_manager
      and rs.slot_number = p_slot_number
      and rs.end_week is null
      and c.status in ('eliminated', 'withdrawn')
  ) then
    raise exception 'That slot is not open for a recast';
  end if;

  if not exists (
    select 1 from public.couples
    where id = p_couple_id and status = 'active' and season_id = public.active_season_id()
  ) then
    raise exception 'That couple is not available';
  end if;

  if exists (
    select 1 from public.roster_slots
    where league_id = p_league_id and couple_id = p_couple_id and end_week is null
  ) then
    raise exception 'That couple is already on a roster in this league';
  end if;

  select min(w.week_number)-1 into v_current_week from public.competition_weeks w
  where w.season_id=public.active_season_id() and (select min(e.airs_at) from public.episodes e where e.week_id=w.id)>now();
  if v_current_week is null then raise exception 'No upcoming competition week is scheduled'; end if;

  insert into public.waiver_claims (league_id, couple_id, manager_id, slot_number, week_number, status)
  values (p_league_id, p_couple_id, v_acting_manager, p_slot_number, v_current_week, 'pending')
  returning * into v_claim;

  -- FCFS resolves immediately; reverse_standings/manual stay pending for the
  -- commissioner to process (the other bidders for the same couple aren't
  -- known yet, so there's nothing to compare against right now).
  if v_league.waiver_claim_method = 'fcfs' then
    return public.finalize_waiver_claim(v_claim.id);
  end if;

  return v_claim;
end;
$$;

create or replace function public.approve_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
  v_league_id uuid;
begin
  select league_id into v_league_id from public.waiver_claims where id=p_claim_id;
  perform 1 from public.leagues where id=v_league_id for update;
  select * into v_claim from public.waiver_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Recast not found';
  end if;

  if not public.is_league_commissioner(v_claim.league_id) then
    raise exception 'Only the commissioner can approve recasts';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'This recast has already been resolved';
  end if;

  return public.finalize_waiver_claim(p_claim_id);
end;
$$;

create or replace function public.reject_waiver_claim(p_claim_id uuid)
returns public.waiver_claims
language plpgsql
security definer set search_path = ''
as $$
declare
  v_claim public.waiver_claims;
  v_league_id uuid;
begin
  select league_id into v_league_id from public.waiver_claims where id=p_claim_id;
  perform 1 from public.leagues where id=v_league_id for update;
  select * into v_claim from public.waiver_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Recast not found';
  end if;

  if not public.is_league_commissioner(v_claim.league_id) then
    raise exception 'Only the commissioner can reject recasts';
  end if;

  if v_claim.status <> 'pending' then raise exception 'This recast has already been resolved'; end if;

  update public.waiver_claims
  set status = 'rejected', resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  return v_claim;
end;
$$;
create or replace function public.capture_expired_finale_deadlines(p_league_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.scoring_settings ss set grand_finale_deadline_at = public.effective_grand_finale_deadline(ss.league_id), grand_finale_deadline_season_id = public.active_season_id()
  where (p_league_id is null or ss.league_id = p_league_id)
    and (ss.grand_finale_deadline_at is null or ss.grand_finale_deadline_season_id is distinct from public.active_season_id())
    and public.effective_grand_finale_deadline(ss.league_id) <= now();
end;
$$;
revoke all on function public.capture_expired_finale_deadlines(uuid) from public,anon,authenticated;

create or replace function public.preserve_finale_deadline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz;
begin
  if tg_table_name = 'scoring_settings' then
    -- Internal capture writes only these private fields and must not recurse.
    if (new.grand_finale_deadline_at,new.grand_finale_deadline_season_id) is distinct from (old.grand_finale_deadline_at,old.grand_finale_deadline_season_id) then return new; end if;
    deadline := public.effective_grand_finale_deadline(old.league_id);
    if deadline <= now() then new.grand_finale_deadline_at := deadline; new.grand_finale_deadline_season_id := public.active_season_id(); end if;
  elsif tg_table_name = 'leagues' then
    perform public.capture_expired_finale_deadlines(old.id);
  else
    -- Capture the old schedule before an edit can move an expired deadline.
    perform public.capture_expired_finale_deadlines(null);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.preserve_finale_deadline() from public,anon,authenticated;
drop trigger if exists preserve_finale_settings on public.scoring_settings;
create trigger preserve_finale_settings before update on public.scoring_settings for each row execute function public.preserve_finale_deadline();
drop trigger if exists preserve_finale_league on public.leagues;
create trigger preserve_finale_league before update on public.leagues for each row execute function public.preserve_finale_deadline();
drop trigger if exists preserve_finale_schedule on public.episodes;
create trigger preserve_finale_schedule before update or delete on public.episodes for each row execute function public.preserve_finale_deadline();
drop trigger if exists preserve_finale_weeks on public.competition_weeks;
create trigger preserve_finale_weeks before update or delete on public.competition_weeks for each row execute function public.preserve_finale_deadline();

create or replace function public.guard_curtain_call_lock_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w record; old_lock timestamptz; new_lock timestamptz; at_time timestamptz;
begin
  if (new.prediction_lock_coast,new.prediction_lock_hours_before_air) is not distinct from (old.prediction_lock_coast,old.prediction_lock_hours_before_air) then return new; end if;
  for w in select cw.id,min(e.airs_at) as airs_at,(array_agg(e.duration_minutes order by e.airs_at))[1] as duration_minutes
    from public.competition_weeks cw join public.episodes e on e.week_id=cw.id
    where cw.season_id=public.active_season_id() group by cw.id having bool_or(e.results_published_at is null) loop
    old_lock := public.prediction_lock_at(old.id,w.id);
    at_time := case when new.prediction_lock_coast='west' then ((w.airs_at at time zone 'America/New_York')::date + time '20:00') at time zone 'America/Los_Angeles' else w.airs_at end;
    new_lock := least(at_time-new.prediction_lock_hours_before_air*interval '1 hour',at_time+w.duration_minutes*interval '1 minute');
    if old_lock <= now() or new_lock <= now() then raise exception 'This week is already locked. Change pick timing after its results are published.'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_curtain_call_lock_edit() from public,anon,authenticated;
drop trigger if exists guard_curtain_call_lock_edit on public.leagues;
create trigger guard_curtain_call_lock_edit before update on public.leagues for each row execute function public.guard_curtain_call_lock_edit();

select public.capture_expired_finale_deadlines(null);
commit;
