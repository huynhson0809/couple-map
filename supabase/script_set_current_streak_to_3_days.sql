-- One-time helper: set a couple's visible current streak to 3 days.
--
-- How to use:
-- 1. Replace PUT_INVITE_CODE_HERE with the couple invite code from Settings.
-- 2. Run this file in Supabase SQL Editor.
--
-- Note: this is a manual display correction. Future calls to
-- public.refresh_couple_streak(...) recalculate streaks from real pins.
-- For a permanent 3-day streak, the pins table also needs both partners to
-- have at least one memory on each of the last 3 days.

do $$
declare
  target_invite_code text := 'PUT_INVITE_CODE_HERE';
  target_couple_id uuid;
  streak_tz text := 'Asia/Ho_Chi_Minh';
  today date := (now() at time zone streak_tz)::date;
  day_offset int;
begin
  if target_invite_code = 'PUT_INVITE_CODE_HERE' then
    raise exception 'Replace PUT_INVITE_CODE_HERE with your couple invite code first.';
  end if;

  select id
    into target_couple_id
    from public.couples
    where invite_code = upper(trim(target_invite_code));

  if target_couple_id is null then
    raise exception 'Couple invite code % was not found.', target_invite_code;
  end if;

  for day_offset in 0..2 loop
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
    today,
    today,
    true,
    true,
    true,
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
    set current_count = 3,
        best_count = greatest(public.couple_streaks.best_count, 3),
        last_completed_date = today,
        today_date = today,
        today_user_a_posted = true,
        today_user_b_posted = true,
        today_completed = true,
        timezone = streak_tz,
        updated_at = now();

  delete from public.streak_reminder_logs
    where couple_id = target_couple_id
      and reminder_date = today;
end $$;
