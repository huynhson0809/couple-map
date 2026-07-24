-- Pinly streak reminder cron diagnostics + setup.
-- Run the diagnostic SELECTs first. Only run the setup block after replacing
-- <PROJECT_REF> and <STREAK_REMINDER_SECRET>.
-- Existing production job name may be either 'streak-reminders-hourly' or
-- 'pinly-streak-reminders-hourly'.

-- 1) Check whether the cron job exists.
select
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname in ('streak-reminders-hourly', 'pinly-streak-reminders-hourly');

-- 2) Check recent cron executions. A successful run means the scheduled SQL ran;
-- the Edge Function evaluates each recipient in their own timezone.
select
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname in ('streak-reminders-hourly', 'pinly-streak-reminders-hourly')
)
order by start_time desc
limit 20;

-- 2b) Check the HTTP responses produced by net.http_post.
-- pg_net stores responses only for a short time by default, so run this soon
-- after the hourly job fires.
select
  id,
  status_code,
  timed_out,
  error_msg,
  left(coalesce(content, ''), 1200) as content,
  created
from net._http_response
order by created desc
limit 20;

-- 3) Check whether the function actually inserted reminder logs.
select
  couple_id,
  recipient_user_id,
  reminder_date,
  reminder_hour,
  created_at
from public.streak_reminder_logs
order by created_at desc
limit 20;

-- 4) Check incomplete streak rows. The date/timezone can differ per space.
select
  couple_id,
  current_count,
  today_date,
  today_user_a_posted,
  today_user_b_posted,
  today_completed,
  updated_at
from public.couple_streaks
where today_completed = false;

-- 5) Optional setup: create or replace the reminder cron.
-- Run hourly in UTC. The Edge Function maps this instant to each recipient's
-- saved IANA timezone and only sends during their local reminder windows.
-- IMPORTANT: replace placeholders before running.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if '<PROJECT_REF>' like '<%' or '<STREAK_REMINDER_SECRET>' like '<%' then
    raise exception 'Replace <PROJECT_REF> and <STREAK_REMINDER_SECRET> before creating the cron job.';
  end if;
end
$$;

do $$
begin
  perform cron.unschedule('streak-reminders-hourly');
  perform cron.unschedule('pinly-streak-reminders-hourly');
exception
  when others then null;
end
$$;

select cron.schedule(
  'streak-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-streak-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-streak-secret', '<STREAK_REMINDER_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
