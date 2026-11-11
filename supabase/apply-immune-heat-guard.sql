-- A couple marked out of a special round (Immune, Not Dancing or Withdrawn)
-- can't be put into one of its heats or teams. Marking them takes them out
-- (apply_round_exception) and Enter Results no longer offers them, but a
-- heat save or a plan save could still add them back. The round's immunity
-- row (heat_number null) holds its immune couples on purpose, so it is exempt.
-- Checked at commit, on the final rows: a plan save writes heats before it
-- clears or adds exceptions, so a couple can pass through a heat mid-save,
-- and a member a save leaves in place is never re-checked on its way.
-- Safe to run again.

create or replace function public.refuse_out_of_round_heat_member()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_round public.episode_rounds;
  v_kind text;
  v_name text;
begin
  if not exists (select 1 from public.episode_team_members m where m.team_id = new.team_id and m.couple_id = new.couple_id) then
    return null;
  end if;
  select r.* into v_round
  from public.episode_teams t join public.episode_rounds r on r.id = t.round_id
  where t.id = new.team_id and t.heat_number is not null;
  if v_round.id is null then return null; end if;
  select x.kind into v_kind from public.episode_round_exceptions x where x.round_id = v_round.id and x.couple_id = new.couple_id;
  if v_kind is null then return null; end if;
  select p.name into v_name from public.couples c join public.people p on p.id = c.celebrity_id where c.id = new.couple_id;
  raise exception '% is marked % in %. Undo that under Not in This Round first.',
    coalesce(v_name, 'That couple'),
    case v_kind when 'immune' then 'Immune' when 'not_dancing' then 'Not Dancing' else 'Withdrawn' end,
    v_round.round_type;
end $$;

revoke all on function public.refuse_out_of_round_heat_member() from public, anon, authenticated;

drop trigger if exists episode_team_members_out_of_round on public.episode_team_members;
create constraint trigger episode_team_members_out_of_round
  after insert or update of team_id, couple_id on public.episode_team_members
  deferrable initially deferred
  for each row execute function public.refuse_out_of_round_heat_member();
