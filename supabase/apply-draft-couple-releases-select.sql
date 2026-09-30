-- Fans read draft_couple_releases to learn that a couple's draft is out
-- (live-air prompt and posting strip). The table has no scores.
--
-- Prod returned content-range */0 to the authenticated role while Enter
-- Results (service role, which bypasses RLS) still showed the couple as
-- Drafted. The table was created with GRANT SELECT and no policy. With RLS
-- enabled, that grant does not return rows.
--
-- Run this whole file in the Supabase Dashboard SQL Editor. Safe to re-run.
-- A Vercel deploy does not apply it. After it runs, an authenticated
-- select on draft_couple_releases must list the released couples, and
-- loadDraftScoreContext then sets draftReleaseWeekNumber for that week.

grant select on public.draft_couple_releases to authenticated;

alter table public.draft_couple_releases enable row level security;

drop policy if exists "draft couple releases are viewable by all authenticated users"
  on public.draft_couple_releases;

create policy "draft couple releases are viewable by all authenticated users"
on public.draft_couple_releases
for select
to authenticated
using (true);
