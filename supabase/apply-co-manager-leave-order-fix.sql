-- Follow-up to apply-co-manager.sql, caught by live testing
-- (scratch/test-co-manager.mjs): leave_league checked is_league_commissioner
-- before the co-manager check, so a co-manager of a commissioner's team
-- (full parity means they pass is_league_commissioner too) got the
-- misleading "Commissioners can't leave their own league" instead of "Use
-- \"Leave as co-manager\" instead". Purely a check-reordering fix — nobody's
-- actual ability to leave changes, just which message they see.
--
-- Run in the Supabase Dashboard SQL Editor. No types.ts regeneration needed
-- (no schema/signature change).

begin;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and co_manager_id = auth.uid()
  ) then
    raise exception 'Use "Leave as co-manager" instead';
  end if;

  if public.is_league_commissioner(p_league_id) then
    raise exception 'Commissioners can''t leave their own league';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and draft_status = 'in_progress'
  ) then
    raise exception 'Draft in progress — ask the commissioner to cancel it first';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid() and co_manager_id is not null
  ) then
    raise exception 'Detach your co-manager before leaving';
  end if;

  delete from public.league_members
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league';
  end if;
end;
$$;

commit;
