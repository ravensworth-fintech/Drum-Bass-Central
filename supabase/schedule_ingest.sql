-- Run ONCE in the Supabase SQL Editor (after the site is deployed). Free: pg_cron and pg_net are Supabase extensions.
-- Safe to run again: a job with the same name is replaced, not duplicated.
--
-- BEFORE RUNNING: replace  YOUR_CRON_SECRET  (4 places) with the same value as CRON_SECRET in your Vercel environment variables.
-- If your site address is not https://dtf.bgoodvt.com, replace that too.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Every 2 hours: scan every enabled channel. (Least-recently-scanned first, ~40 seconds per run.)
select cron.schedule('dtf-ingest', '0 */2 * * *', $$
  select net.http_get(
    url := 'https://dtf.bgoodvt.com/api/ingest',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
$$);

-- Daily 06:30 UTC: look for tracklists for new mixes (same job the old Vercel schedule ran).
select cron.schedule('dtf-tracklists', '30 6 * * *', $$
  select net.http_get(
    url := 'https://dtf.bgoodvt.com/api/ingest?tracklists=1',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
$$);

-- Daily 07:00 UTC: Discover looks for new channels to suggest.
select cron.schedule('dtf-discover', '0 7 * * *', $$
  select net.http_get(
    url := 'https://dtf.bgoodvt.com/api/discover',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
$$);

-- Daily 05:15 UTC: scans now run 12 times a day, so keep only the last 14 days of scan logs (keeps the free database small).
select cron.schedule('dtf-prune-scan-history', '15 5 * * *', $$
  delete from scan_history where started_at < now() - interval '14 days';
$$);

-- CHECK IT WORKS (run these after the next scheduled time, or after changing a schedule to '* * * * *' for a minute):
--   select jobname, schedule, active from cron.job;
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, error_msg, created from net._http_response order by created desc limit 5;   -- status_code 200 = the site answered
--
-- TO STOP A JOB:  select cron.unschedule('dtf-ingest');
