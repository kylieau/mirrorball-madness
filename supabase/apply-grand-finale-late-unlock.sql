-- Grand Finale late-entry unlock.
-- Run this whole file in the Supabase Dashboard SQL Editor.
-- Safe to re-run. schema.sql stays the greenfield source of truth.
--
-- Publishing a week reads grand_finale_late_unlocks, so run this before the
-- next results publish after the app deploy.

create table if not exists public.grand_finale_late_unlocks (
  league_id uuid not null references public.leagues(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  late_factor numeric(3,2) not null default 1 check (late_factor >= 0 and late_factor <= 1),
  unlocked_by uuid not null references public.profiles(id),
  unlocked_at timestamptz not null default now(),
  submitted_at timestamptz,
  ineligible_couple_ids uuid[] not null default '{}',
  primary key (league_id, manager_id)
);

alter table public.grand_finale_late_unlocks enable row level security;

grant select on public.grand_finale_late_unlocks to authenticated;

drop policy if exists "grand finale late unlocks are viewable by league members" on public.grand_finale_late_unlocks;
create policy "grand finale late unlocks are viewable by league members"
on public.grand_finale_late_unlocks for select
using (public.is_league_member(league_id));

-- Commissioner of this league, or a super admin in any league. A manager
-- cannot open their own window; the button lives on League Settings.
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

  if found then
    if v_submitted is null then
      raise exception 'Late Grand Finale is already open for this manager';
    end if;
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

  begin
    insert into public.grand_finale_late_unlocks (league_id, manager_id, late_factor, unlocked_by)
    values (p_league_id, p_manager_id, v_factor, auth.uid());
  exception
    when unique_violation then
      raise exception 'Late Grand Finale is already open for this manager';
  end;
end;
$$;

revoke execute on function public.unlock_grand_finale_late(uuid, uuid, numeric, boolean) from public;
grant execute on function public.unlock_grand_finale_late(uuid, uuid, numeric, boolean) to authenticated;

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

revoke execute on function public.submit_grand_finale_prediction(uuid, uuid[]) from public;
grant execute on function public.submit_grand_finale_prediction(uuid, uuid[]) to authenticated;

