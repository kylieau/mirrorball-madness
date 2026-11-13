-- Schedules the waiver run. Run once in the Supabase SQL Editor after
-- apply-recast-v2.sql, with the pg_cron extension enabled (Dashboard →
-- Database → Extensions). process_due_recasts is safe to call at any time:
-- it only decides a league whose run is due and hasn't happened, and then
-- (apply-trade-execution.sql) executes the trades whose veto window has
-- closed, so the one job covers both.

select cron.schedule('process-due-recasts', '*/15 * * * *', $$select public.process_due_recasts()$$);

-- To check it: select jobname, schedule, active from cron.job;
-- Its runs:    select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- To stop it:  select cron.unschedule('process-due-recasts');
