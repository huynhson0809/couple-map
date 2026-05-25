-- One-time helper: add 3 days to the current visible streak.
--
-- Invite code is prefilled for this couple. Run in Supabase SQL Editor.
-- This is a display correction: it preserves today as an open day and anchors
-- the streak to the latest completed day.

do $$
declare
  target_invite_code text := 'BB3938';
  target_couple_id uuid;
  target_user_a uuid;
  target_user_b uuid;
  streak_tz text := 'Asia/Ho_Chi_Minh';
  today date := (now() at time zone streak_tz)::date;
  summary record;
  anchor_date date;
  target_count int;
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

  select *
    into summary
    from public.couple_streaks
    where couple_id = target_couple_id;

  select
    count(*) filter (where created_by = target_user_a)::int,
    count(*) filter (where created_by = target_user_b)::int
    into today_a_count, today_b_count
    from public.pins
    where couple_id = target_couple_id
      and (created_at at time zone streak_tz)::date = today;

  today_done := today_a_count > 0 and today_b_count > 0;
  anchor_date := case
    when today_done then today
    else coalesce(summary.last_completed_date, today - 1)
  end;
  target_count := coalesce(summary.current_count, 0) + 3;

  if target_count < 3 then
    target_count := 3;
  end if;

  for day_offset in 0..(target_count - 1) loop
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
      anchor_date - day_offset,
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

  if not today_done then
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
      false,
      null,
      now()
    )
    on conflict (couple_id, streak_date) do update
      set user_a_pin_count = excluded.user_a_pin_count,
          user_b_pin_count = excluded.user_b_pin_count,
          user_a_posted = excluded.user_a_posted,
          user_b_posted = excluded.user_b_posted,
          completed = false,
          completed_at = null,
          updated_at = now();
  end if;

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
    target_count,
    target_count,
    anchor_date,
    today,
    today_a_count > 0,
    today_b_count > 0,
    today_done,
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
    set current_count = target_count,
        best_count = greatest(public.couple_streaks.best_count, target_count),
        last_completed_date = anchor_date,
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
