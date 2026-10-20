-- League Settings opened by a site admin who isn't in the league reads with the
-- service role, which needs these to find the season and its deadlines (else
-- Grand Finale's Missed the lock never appears there).
grant execute on function public.active_season_id() to service_role;
grant execute on function public.effective_hard_deadline_week(uuid) to service_role;
grant execute on function public.effective_grand_finale_deadline(uuid) to service_role;
