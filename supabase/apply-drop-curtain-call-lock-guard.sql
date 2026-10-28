-- Mirrorball Madness. Drops guard_curtain_call_lock_edit (apply-audit-deadlines.sql).
-- A commissioner may change Curtain Call timing at any time, including to
-- reopen or close the current week's picks (owner decision, 2026-10-27);
-- League Settings asks them to confirm either flip.
begin;
drop trigger if exists guard_curtain_call_lock_edit on public.leagues;
drop function if exists public.guard_curtain_call_lock_edit();
commit;
