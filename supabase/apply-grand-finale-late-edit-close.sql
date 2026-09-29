-- Grand Finale late-entry: let a commissioner edit the penalty percent on an
-- already-open (not yet submitted) late entry, and close one outright if it
-- was opened by mistake or is no longer needed.
--
-- Run this whole file in the Supabase Dashboard SQL Editor. Safe to re-run.
-- schema.sql stays the greenfield source of truth and already reflects this.

-- unlock_grand_finale_late now upserts on an existing, unsubmitted row
-- (editing the percent) instead of raising "already open". An already-used
-- (submitted) entry still can't be reopened or edited.
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

revoke execute on function public.unlock_grand_finale_late(uuid, uuid, numeric, boolean) from public;
grant execute on function public.unlock_grand_finale_late(uuid, uuid, numeric, boolean) to authenticated;

-- Commissioner/super-admin can close an open, not-yet-used late entry --
-- e.g. opened it by mistake, or the manager no longer needs it. A used
-- (submitted) entry is permanent and can't be closed.
create or replace function public.close_grand_finale_late(
  p_league_id uuid,
  p_manager_id uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not (
    public.is_league_commissioner(p_league_id)
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin)
  ) then
    raise exception 'Only a commissioner or a super admin can close a late entry';
  end if;

  delete from public.grand_finale_late_unlocks
  where league_id = p_league_id
    and manager_id = p_manager_id
    and submitted_at is null;

  if not found then
    raise exception 'No open late entry to close for this manager';
  end if;
end;
$$;

revoke execute on function public.close_grand_finale_late(uuid, uuid) from public;
grant execute on function public.close_grand_finale_late(uuid, uuid) to authenticated;
