-- Follow-up to apply-co-manager.sql: lets the /join/co-manager/[code] page
-- show which league and whose team a signed-in visitor is about to co-manage,
-- instead of a generic "you've been invited" with no context. Restricted to
-- `authenticated` (this schema never grants anon anything — a signed-out
-- visitor still only sees the generic copy + sign-up/sign-in buttons, same
-- as every other page here), and keyed only by the code itself — the caller
-- doesn't need to already be a league member, same trust boundary
-- join_as_co_manager already uses.
--
-- Run in the Supabase Dashboard SQL Editor, then regenerate
-- src/lib/supabase/types.ts.

begin;

create function public.get_co_manager_invite_info(p_code text)
returns table(league_name text, primary_display_name text)
language sql
security definer
set search_path = ''
stable
as $$
  select l.name, p.display_name
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  join public.profiles p on p.id = lm.user_id
  where lm.co_manager_invite_code = trim(upper(p_code))
  limit 1;
$$;

revoke execute on function public.get_co_manager_invite_info(text) from public;
grant execute on function public.get_co_manager_invite_info(text) to authenticated;

commit;
