-- Invite page preview: lets /join/[code] name the league before the visitor
-- signs up, and say so up front when a code doesn't exist. Returns only the
-- league name, its team count and whether a draft is running (joining is
-- refused mid-draft) for an exact invite-code match, so it is the one
-- function signed-out visitors (anon) may call. Anyone holding a code could
-- join with it anyway.
--
-- Run this whole file in the Supabase Dashboard SQL Editor. Safe to re-run.
-- schema.sql stays the greenfield source of truth and already reflects this.

create or replace function public.league_invite_preview(p_invite_code text)
returns table (league_name text, team_count integer, draft_in_progress boolean)
language sql
stable
security definer set search_path = ''
as $$
  select
    l.name,
    (select count(*)::integer from public.league_members m where m.league_id = l.id),
    l.draft_status = 'in_progress'
  from public.leagues l
  where l.invite_code = trim(upper(p_invite_code));
$$;

revoke execute on function public.league_invite_preview(text) from public;
grant execute on function public.league_invite_preview(text) to anon, authenticated;
