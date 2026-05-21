-- Keep a streak alive during the current open day.
-- Run this in Supabase SQL Editor after the original streak migration.

create or replace function public.refresh_couple_streak(target_couple_id uuid)
returns public.couple_streaks
language plpgsql
security definer
set search_path = public
as $$
declare
  couple_row record;
  streak_tz text := 'Asia/Ho_Chi_Minh';
  streak_today date := (now() at time zone streak_tz)::date;
  anchor_date date;
  anchor_completed boolean;
  day_row record;
  previous_completed_date date;
  run_count int := 0;
  computed_current int := 0;
  computed_best int := 0;
  computed_last_completed date;
  today_a boolean := false;
  today_b boolean := false;
  today_done boolean := false;
  existing_summary record;
  result public.couple_streaks;
begin
  select id, user_a, user_b
    into couple_row
    from public.couples
    where id = target_couple_id;

  if couple_row.id is null then
    return null;
  end if;

  select current_count, best_count, last_completed_date
    into existing_summary
    from public.couple_streaks
    where couple_id = target_couple_id;

  delete from public.couple_streak_days
    where couple_id = target_couple_id;

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
  with daily as (
    select
      (p.created_at at time zone streak_tz)::date as streak_date,
      count(*) filter (where p.created_by = couple_row.user_a)::int as user_a_pin_count,
      count(*) filter (where p.created_by = couple_row.user_b)::int as user_b_pin_count,
      max(p.created_at) as latest_pin_at
    from public.pins p
    where p.couple_id = target_couple_id
    group by (p.created_at at time zone streak_tz)::date
  )
  select
    target_couple_id,
    streak_date,
    user_a_pin_count,
    user_b_pin_count,
    user_a_pin_count > 0,
    user_b_pin_count > 0,
    user_a_pin_count > 0 and user_b_pin_count > 0,
    case when user_a_pin_count > 0 and user_b_pin_count > 0 then latest_pin_at else null end,
    now()
  from daily;

  for day_row in
    select streak_date
    from public.couple_streak_days
    where couple_id = target_couple_id
      and completed = true
    order by streak_date
  loop
    if previous_completed_date is not null
      and day_row.streak_date = previous_completed_date + 1
    then
      run_count := run_count + 1;
    else
      run_count := 1;
    end if;

    computed_best := greatest(computed_best, run_count);
    computed_last_completed := day_row.streak_date;
    previous_completed_date := day_row.streak_date;
  end loop;

  select completed
    into anchor_completed
    from public.couple_streak_days
    where couple_id = target_couple_id
      and streak_date = streak_today;

  -- Today is still open. Until both people have saved a memory today,
  -- the visible streak should stay anchored to yesterday. It only drops
  -- after a full calendar day was missed.
  if coalesce(anchor_completed, false) then
    anchor_date := streak_today;
  else
    anchor_date := streak_today - 1;
  end if;

  loop
    select completed
      into anchor_completed
      from public.couple_streak_days
      where couple_id = target_couple_id
        and streak_date = anchor_date - computed_current;

    exit when not coalesce(anchor_completed, false);
    computed_current := computed_current + 1;
  end loop;

  select user_a_posted, user_b_posted, completed
    into today_a, today_b, today_done
    from public.couple_streak_days
    where couple_id = target_couple_id
      and streak_date = streak_today;

  if not coalesce(today_done, false)
    and existing_summary.last_completed_date = streak_today - 1
  then
    computed_current := greatest(computed_current, existing_summary.current_count);
    computed_best := greatest(computed_best, existing_summary.best_count, computed_current);
    computed_last_completed := existing_summary.last_completed_date;
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
    computed_current,
    greatest(computed_best, computed_current),
    computed_last_completed,
    streak_today,
    coalesce(today_a, false),
    coalesce(today_b, false),
    coalesce(today_done, false),
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
    set current_count = excluded.current_count,
        best_count = greatest(public.couple_streaks.best_count, excluded.best_count),
        last_completed_date = excluded.last_completed_date,
        today_date = excluded.today_date,
        today_user_a_posted = excluded.today_user_a_posted,
        today_user_b_posted = excluded.today_user_b_posted,
        today_completed = excluded.today_completed,
        timezone = excluded.timezone,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

do $$
declare
  c record;
begin
  for c in select id from public.couples loop
    perform public.refresh_couple_streak(c.id);
  end loop;
end $$;
