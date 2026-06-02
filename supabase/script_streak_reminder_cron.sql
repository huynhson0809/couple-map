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
-- the Edge Function can still return "Outside reminder window" if the request
-- passes a non-reminder hour.
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
  reminder_date,
  reminder_hour,
  created_at
from public.streak_reminder_logs
order by created_at desc
limit 20;

-- 4) Check the rows that are eligible right now. If this returns zero rows,
-- the function has nothing to send because the streak is already completed
-- or today_date was not refreshed to the requested date.
select
  couple_id,
  current_count,
  today_date,
  today_user_a_posted,
  today_user_b_posted,
  today_completed,
  updated_at
from public.couple_streaks
where today_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
  and today_completed = false;

-- 5) Optional setup: create or replace the reminder cron.
-- Supabase cron runs in UTC. Vietnam is UTC+7, so these UTC hours are:
-- 05:00 = 12:00 VN, 13:00 = 20:00 VN, 15:00 = 22:00 VN, 16:00 = 23:00 VN.
-- The body explicitly passes the Vietnam date/hour so the Edge Function cannot
-- accidentally use hour 0 from a stale body/header.
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
  '0 5,13,15,16 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-streak-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-streak-secret', '<STREAK_REMINDER_SECRET>'
    ),
    body := jsonb_build_object(
      'date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text,
      'hour', extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int
    ),
    timeout_milliseconds := 60000
  );
  $$
);
