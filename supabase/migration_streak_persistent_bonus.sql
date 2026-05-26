-- Persist manual streak corrections across refreshes.
--
-- Run this after migration_streaks.sql and migration_streak_grace_period.sql.
--
-- Why this exists:
-- refresh_couple_streak rebuilds couple_streak_days from real pins every time.
-- Any "fake" completed days inserted by helper scripts are intentionally wiped.
-- Store manual corrections as a bonus on couple_streaks instead, then add that
-- bonus to the real streak while the chain is still alive.

alter table public.couple_streaks
  add column if not exists streak_bonus_count int not null default 0;

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
  effective_current int := 0;
  effective_best int := 0;
  bonus_count int := 0;
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

  select current_count, best_count, last_completed_date, streak_bonus_count
    into existing_summary
    from public.couple_streaks
    where couple_id = target_couple_id;

  bonus_count := greatest(coalesce(existing_summary.streak_bonus_count, 0), 0);

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

  -- Migrate old manual corrections that directly overwrote current_count.
  -- If the old summary is still anchored to the same open/complete day and is
  -- larger than the real pin-derived streak, persist the difference as bonus.
  if bonus_count = 0
    and coalesce(existing_summary.current_count, 0) > computed_current
    and existing_summary.last_completed_date = anchor_date
  then
    bonus_count := coalesce(existing_summary.current_count, 0) - computed_current;
  end if;

  -- Add manual bonus only while the real chain is still alive.
  -- If the couple actually misses a full day, computed_current becomes 0 and
  -- current_count resets to 0 instead of keeping a stale manual bonus alive.
  effective_current := case
    when computed_current > 0 then computed_current + bonus_count
    when bonus_count > 0 and existing_summary.last_completed_date = anchor_date then bonus_count
    else 0
  end;
  if effective_current > 0 and computed_last_completed is null then
    computed_last_completed := existing_summary.last_completed_date;
  end if;
  effective_best := greatest(
    coalesce(existing_summary.best_count, 0),
    computed_best + bonus_count,
    effective_current
  );

  insert into public.couple_streaks (
    couple_id,
    current_count,
    best_count,
    last_completed_date,
    today_date,
    today_user_a_posted,
    today_user_b_posted,
    today_completed,
    streak_bonus_count,
    timezone,
    updated_at
  )
  values (
    target_couple_id,
    effective_current,
    effective_best,
    computed_last_completed,
    streak_today,
    coalesce(today_a, false),
    coalesce(today_b, false),
    coalesce(today_done, false),
    bonus_count,
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
        streak_bonus_count = excluded.streak_bonus_count,
        timezone = streak_tz,
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
