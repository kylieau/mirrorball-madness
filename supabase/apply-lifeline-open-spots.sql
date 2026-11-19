-- Lifeline covers any open roster spot (Kylie, 2026-11-19): one whose couple
-- went home in an earlier week, as before, or one nobody holds that week
-- because a trade emptied it. set_lifeline_pick and every payout read this
-- rule (buildLifelinePayouts mirrors it as isDeadSlot). Safe to run again.

create or replace function public.lifeline_slot_is_dead(p_league_id uuid, p_manager_id uuid, p_slot_number int, p_week_number int)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_slot_number between 1 and (select l.roster_size from public.leagues l where l.id = p_league_id)
    and not exists (
      select 1 from public.roster_slots rs
      join public.couples c on c.id = rs.couple_id
      where rs.league_id = p_league_id and rs.manager_id = p_manager_id and rs.slot_number = p_slot_number
        and rs.start_week <= p_week_number and (rs.end_week is null or rs.end_week >= p_week_number)
        and not (
          c.status in ('eliminated', 'withdrawn') and c.elimination_week is not null
          and c.elimination_week < p_week_number
        )
    );
$$;
revoke execute on function public.lifeline_slot_is_dead(uuid, uuid, int, int) from public, anon, authenticated;
