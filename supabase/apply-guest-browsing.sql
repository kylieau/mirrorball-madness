-- Signed-out guests can browse Home and Results: read the active season's
-- schedule, cast and officially published scores and outcomes. Nothing
-- league-scoped (picks, rosters, standings, members) and no drafts.
--
-- These tables' SELECT policies are `using (true)` for every role, so the
-- grants alone would also expose a live reveal's dance_scores (posted before
-- the episode is published). The restrictive policies keep anon to
-- published episodes only; signed-in viewers are unaffected.

grant execute on function public.active_season_id() to anon;

grant select on public.seasons to anon;
grant select on public.competition_weeks to anon;
grant select on public.episodes to anon;
grant select on public.couples to anon;
grant select on public.people to anon;
grant select on public.dance_styles to anon;
grant select on public.dance_scores to anon;
grant select on public.episode_results to anon;
grant select on public.episode_in_jeopardy_couples to anon;

create policy "guests see published dance scores only"
  on public.dance_scores as restrictive for select to anon
  using (exists (
    select 1 from public.episodes e
    where e.id = dance_scores.episode_id and e.results_published_at is not null
  ));

create policy "guests see published episode results only"
  on public.episode_results as restrictive for select to anon
  using (exists (
    select 1 from public.episodes e
    where e.id = episode_results.episode_id and e.results_published_at is not null
  ));

create policy "guests see published in jeopardy only"
  on public.episode_in_jeopardy_couples as restrictive for select to anon
  using (exists (
    select 1 from public.episodes e
    where e.id = episode_in_jeopardy_couples.episode_id and e.results_published_at is not null
  ));
