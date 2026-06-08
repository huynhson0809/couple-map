-- Plan-aware streak grace: monthly protection charges.
-- Pro: 3 charges/month, Plus: 1 charge/month, Free: 0.
-- Each missed day consumes 1 charge. If charges run out, streak breaks.
-- Charges reset at the start of each calendar month (VN time).
--
-- Run this after migration_streak_persistent_bonus.sql.

-- Add grace tracking columns
alter table public.couple_streaks
  add column if not exists grace_used_this_month int not null default 0,
  add column if not exists grace_month text not null default '';

create or replace function public.refresh_couple_streak(target_couple_id uuid)
returns public.couple_streaks
language plpgsql
security definer
set search_path = public
as $$
declare
  couple_row record;
  couple_plan text;
  grace_budget int;
  streak_tz text := 'Asia/Ho_Chi_Minh';
  streak_today date := (now() at time zone streak_tz)::date;
  current_month text := to_char(streak_today, 'YYYY-MM');
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
  gap_days int := 0;
  v_grace_used int := 0;
  v_grace_month text := '';
  remaining_grace int := 0;
  result public.couple_streaks;
begin
  select id, user_a, user_b, plan
    into couple_row
    from public.couples
    where id = target_couple_id;

  if couple_row.id is null then
    return null;
  end if;

  -- Determine grace budget based on plan
  couple_plan := coalesce(couple_row.plan, 'free');
  grace_budget := case couple_plan
    when 'pro' then 3
    when 'plus' then 1
    else 0
  end;

  select current_count, best_count, last_completed_date, streak_bonus_count,
         grace_used_this_month, grace_month
    into existing_summary
    from public.couple_streaks
    where couple_id = target_couple_id;

  bonus_count := greatest(coalesce(existing_summary.streak_bonus_count, 0), 0);

  -- Reset grace charges if new month
  v_grace_month := coalesce(existing_summary.grace_month, '');
  v_grace_used := coalesce(existing_summary.grace_used_this_month, 0);
  if v_grace_month <> current_month then
    v_grace_used := 0;
    v_grace_month := current_month;
  end if;

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

  -- Compute the longest real consecutive streak and current run
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

  -- Count backward from yesterday to find current real consecutive streak
  computed_current := 0;
  anchor_date := streak_today - 1;
  loop
    select completed
      into anchor_completed
      from public.couple_streak_days
      where couple_id = target_couple_id
        and streak_date = anchor_date - computed_current;

    exit when not coalesce(anchor_completed, false);
    computed_current := computed_current + 1;
  end loop;

  -- If today is already completed, include it
  select user_a_posted, user_b_posted, completed
    into today_a, today_b, today_done
    from public.couple_streak_days
    where couple_id = target_couple_id
      and streak_date = streak_today;

  if coalesce(today_done, false) then
    computed_current := computed_current + 1;
  end if;

  -- Grace protection: count gap days between last_completed and yesterday.
  -- Today is still open (not a miss yet). Only past days count as gaps.
  if computed_last_completed is not null and not coalesce(today_done, false) then
    gap_days := (streak_today - 1) - computed_last_completed;
    -- gap_days < 0 means last_completed IS yesterday → no gap
    if gap_days < 0 then
      gap_days := 0;
    end if;
  else
    gap_days := 0;
  end if;

  -- Determine if grace covers the gap
  remaining_grace := grace_budget - v_grace_used;

  if gap_days > 0 and computed_current = 0 and computed_last_completed is not null then
    -- Check if this gap was already grace-protected in a previous refresh
    -- (existing streak was alive and anchored to the same last_completed_date)
    if coalesce(existing_summary.current_count, 0) > 0
      and existing_summary.last_completed_date = computed_last_completed
    then
      -- Gap already covered by grace in a previous run. Just maintain streak.
      computed_current := existing_summary.current_count;
    elsif gap_days <= remaining_grace then
      -- New gap: consume grace charges
      v_grace_used := v_grace_used + gap_days;
      computed_current := coalesce(existing_summary.current_count, 0);
    else
      -- Grace exhausted: streak breaks
      computed_current := 0;
    end if;
  end if;

  -- Migrate old manual bonus corrections
  if bonus_count = 0
    and coalesce(existing_summary.current_count, 0) > computed_current
    and existing_summary.last_completed_date = computed_last_completed
  then
    bonus_count := coalesce(existing_summary.current_count, 0) - computed_current;
  end if;

  -- Add manual bonus only while the real chain is still alive.
  effective_current := case
    when computed_current > 0 then computed_current + bonus_count
    else 0
  end;

  if effective_current > 0 and computed_last_completed is null then
    computed_last_completed := existing_summary.last_completed_date;
  end if;

  -- Best streak is based on real pin-derived streak only, not inflated by bonus.
  effective_best := greatest(computed_best, computed_current);

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
    grace_used_this_month,
    grace_month,
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
    v_grace_used,
    v_grace_month,
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
    set current_count = excluded.current_count,
        best_count = excluded.best_count,
        last_completed_date = excluded.last_completed_date,
        today_date = excluded.today_date,
        today_user_a_posted = excluded.today_user_a_posted,
        today_user_b_posted = excluded.today_user_b_posted,
        today_completed = excluded.today_completed,
        streak_bonus_count = excluded.streak_bonus_count,
        grace_used_this_month = excluded.grace_used_this_month,
        grace_month = excluded.grace_month,
        timezone = streak_tz,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- Refresh all streaks with the new plan-aware grace logic
do $$
declare
  c record;
begin
  for c in select id from public.couples loop
    perform public.refresh_couple_streak(c.id);
  end loop;
end $$;
