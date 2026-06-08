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
  day_row record;
  previous_completed_date date;
  run_count int := 0;
  longest_run int := 0;
  last_completed date;
  today_a boolean := false;
  today_b boolean := false;
  today_done boolean := false;
  existing record;
  v_grace_used int := 0;
  v_grace_month text := '';
  final_current int := 0;
  final_best int := 0;
  result public.couple_streaks;
begin
  select id, user_a, user_b, plan
    into couple_row
    from public.couples
    where id = target_couple_id;

  if couple_row.id is null then
    return null;
  end if;

  couple_plan := coalesce(couple_row.plan, 'free');
  grace_budget := case couple_plan
    when 'pro' then 3
    when 'plus' then 1
    else 0
  end;

  -- Get existing streak state
  select current_count, best_count, last_completed_date,
         grace_used_this_month, grace_month, streak_bonus_count
    into existing
    from public.couple_streaks
    where couple_id = target_couple_id;

  -- Reset grace if new month
  v_grace_month := coalesce(existing.grace_month, '');
  v_grace_used := coalesce(existing.grace_used_this_month, 0);
  if v_grace_month <> current_month then
    v_grace_used := 0;
    v_grace_month := current_month;
  end if;

  -- Rebuild streak_days from pins
  delete from public.couple_streak_days where couple_id = target_couple_id;

  insert into public.couple_streak_days (
    couple_id, streak_date,
    user_a_pin_count, user_b_pin_count,
    user_a_posted, user_b_posted,
    completed, completed_at, updated_at
  )
  with daily as (
    select
      (p.created_at at time zone streak_tz)::date as streak_date,
      count(*) filter (where p.created_by = couple_row.user_a)::int as a_count,
      count(*) filter (where p.created_by = couple_row.user_b)::int as b_count,
      max(p.created_at) as latest
    from public.pins p
    where p.couple_id = target_couple_id
    group by (p.created_at at time zone streak_tz)::date
  )
  select target_couple_id, streak_date, a_count, b_count,
         a_count > 0, b_count > 0,
         a_count > 0 and b_count > 0,
         case when a_count > 0 and b_count > 0 then latest else null end,
         now()
  from daily;

  -- Get today's status
  select user_a_posted, user_b_posted, completed
    into today_a, today_b, today_done
    from public.couple_streak_days
    where couple_id = target_couple_id and streak_date = streak_today;

  -- Find longest consecutive run (for best_count)
  for day_row in
    select streak_date from public.couple_streak_days
    where couple_id = target_couple_id and completed = true
    order by streak_date
  loop
    if previous_completed_date is not null
      and day_row.streak_date = previous_completed_date + 1
    then
      run_count := run_count + 1;
    else
      run_count := 1;
    end if;
    longest_run := greatest(longest_run, run_count);
    last_completed := day_row.streak_date;
    previous_completed_date := day_row.streak_date;
  end loop;

  -- ============================================================
  -- SIMPLE STREAK LOGIC:
  -- The stored current_count is the source of truth.
  -- We only INCREMENT it (today completed) or BREAK it (gap too large).
  -- ============================================================

  final_current := coalesce(existing.current_count, 0);

  if coalesce(today_done, false) then
    -- Today is completed. Was it already counted?
    if existing.last_completed_date = streak_today then
      -- Already counted today, no change
      null;
    elsif existing.last_completed_date = streak_today - 1 then
      -- Yesterday was the last completed → today continues the streak
      final_current := final_current + 1;
    elsif existing.last_completed_date is not null
      and (streak_today - existing.last_completed_date) <= (grace_budget - v_grace_used + 1)
    then
      -- Gap exists but grace covers it
      v_grace_used := v_grace_used + (streak_today - existing.last_completed_date - 1);
      final_current := final_current + 1;
    else
      -- Gap too large or no previous streak → start fresh
      final_current := 1;
    end if;
    last_completed := streak_today;
  else
    -- Today not completed yet. Check if streak is still alive.
    if existing.last_completed_date is not null then
      declare
        days_since int := streak_today - existing.last_completed_date;
      begin
        if days_since <= 1 then
          -- Yesterday or today is last completed → streak alive (open day)
          null;
        elsif days_since <= (grace_budget - v_grace_used + 1) then
          -- Within grace window → streak alive, consume grace
          v_grace_used := v_grace_used + (days_since - 1);
        else
          -- Grace exhausted → streak breaks
          final_current := 0;
        end if;
      end;
    end if;
  end if;

  -- Best is max of longest real run and current (which includes grace continuity)
  final_best := greatest(longest_run, final_current, coalesce(existing.best_count, 0));
  -- But never let best be inflated above what pins can prove + grace
  -- Keep it simple: best = max(real_longest, current)
  final_best := greatest(longest_run, final_current);

  -- Use existing best if larger (don't downgrade)
  if coalesce(existing.best_count, 0) > final_best
    and coalesce(existing.best_count, 0) <= final_current + grace_budget
  then
    final_best := existing.best_count;
  end if;

  insert into public.couple_streaks (
    couple_id, current_count, best_count, last_completed_date,
    today_date, today_user_a_posted, today_user_b_posted, today_completed,
    streak_bonus_count, grace_used_this_month, grace_month, timezone, updated_at
  )
  values (
    target_couple_id,
    final_current,
    final_best,
    coalesce(last_completed, existing.last_completed_date),
    streak_today,
    coalesce(today_a, false),
    coalesce(today_b, false),
    coalesce(today_done, false),
    coalesce(existing.streak_bonus_count, 0),
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

-- NOTE: Do NOT run refresh all here. The function relies on existing.current_count
-- being correct. Only deploy the function, then manually fix affected couples.
