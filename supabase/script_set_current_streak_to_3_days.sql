-- One-time helper: set a couple's visible current streak to 3 days.
--
-- How to use:
-- 1. Run this file in Supabase SQL Editor.
--
-- This keeps today as an open day. The visible streak becomes 3, anchored
-- to yesterday, so today can still show "waiting" until both people add a memory.

do $$
declare
  target_invite_code text := 'BB3938';
  target_couple_id uuid;
  target_user_a uuid;
  target_user_b uuid;
  streak_tz text := 'Asia/Ho_Chi_Minh';
  today date := (now() at time zone streak_tz)::date;
  day_offset int;
  today_a_count int := 0;
  today_b_count int := 0;
  today_done boolean := false;
begin
  select id, user_a, user_b
    into target_couple_id, target_user_a, target_user_b
    from public.couples
    where invite_code = upper(trim(target_invite_code));

  if target_couple_id is null then
    raise exception 'Couple invite code % was not found.', target_invite_code;
  end if;

  for day_offset in 1..3 loop
    insert into public.couple_streak_days (
      couple_id,
      streak_date,
      user_a_pin_count,
      user_b_pin_count,
      user_a_posted,
      user_b_posted,
      completed,
      completed_at,
      updated_at
    )
    values (
      target_couple_id,
      today - day_offset,
      1,
      1,
      true,
      true,
      true,
      now(),
      now()
    )
    on conflict (couple_id, streak_date) do update
      set user_a_pin_count = greatest(public.couple_streak_days.user_a_pin_count, 1),
          user_b_pin_count = greatest(public.couple_streak_days.user_b_pin_count, 1),
          user_a_posted = true,
          user_b_posted = true,
          completed = true,
          completed_at = coalesce(public.couple_streak_days.completed_at, now()),
          updated_at = now();
  end loop;

  select
    count(*) filter (where created_by = target_user_a)::int,
    count(*) filter (where created_by = target_user_b)::int
    into today_a_count, today_b_count
    from public.pins
    where couple_id = target_couple_id
      and (created_at at time zone streak_tz)::date = today;

  today_done := today_a_count > 0 and today_b_count > 0;

  insert into public.couple_streak_days (
    couple_id,
    streak_date,
    user_a_pin_count,
    user_b_pin_count,
    user_a_posted,
    user_b_posted,
    completed,
    completed_at,
    updated_at
  )
  values (
    target_couple_id,
    today,
    today_a_count,
    today_b_count,
    today_a_count > 0,
    today_b_count > 0,
    today_done,
    case when today_done then now() else null end,
    now()
  )
  on conflict (couple_id, streak_date) do update
    set user_a_pin_count = excluded.user_a_pin_count,
        user_b_pin_count = excluded.user_b_pin_count,
        user_a_posted = excluded.user_a_posted,
        user_b_posted = excluded.user_b_posted,
        completed = excluded.completed,
        completed_at = case when excluded.completed then coalesce(public.couple_streak_days.completed_at, now()) else null end,
        updated_at = now();

  insert into public.couple_streaks (
    couple_id,
    current_count,
    best_count,
    last_completed_date,
    today_date,
    today_user_a_posted,
    today_user_b_posted,
    today_completed,
    timezone,
    updated_at
  )
  values (
    target_couple_id,
    3,
    3,
    today - 1,
    today,
    today_a_count > 0,
    today_b_count > 0,
    today_done,
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
    set current_count = 3,
        best_count = greatest(public.couple_streaks.best_count, 3),
        last_completed_date = today - 1,
        today_date = today,
        today_user_a_posted = today_a_count > 0,
        today_user_b_posted = today_b_count > 0,
        today_completed = today_done,
        timezone = streak_tz,
        updated_at = now();

  delete from public.streak_reminder_logs
    where couple_id = target_couple_id
      and reminder_date = today;
end $$;
