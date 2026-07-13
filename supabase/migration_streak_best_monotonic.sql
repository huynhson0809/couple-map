-- Make streak records monotonic and refresh grace safely.
--
-- Run after:
--   migration_memory_spaces.sql
--   migration_polar_billing.sql
--   migration_streak_plan_grace.sql
--
-- This migration fixes three production issues:
-- 1. best_count could be overwritten by a shorter, newer streak;
-- 2. repeated refreshes could consume the same open-day grace repeatedly;
-- 3. grace used the stale couples.plan value instead of the space owner's plan.

create or replace function public.preserve_couple_streak_best_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.current_count := greatest(coalesce(new.current_count, 0), 0);

  if tg_op = 'UPDATE' then
    new.best_count := greatest(
      coalesce(old.best_count, 0),
      coalesce(new.best_count, 0),
      new.current_count
    );
  else
    new.best_count := greatest(coalesce(new.best_count, 0), new.current_count);
  end if;

  return new;
end;
$$;

drop trigger if exists couple_streaks_preserve_best_count
  on public.couple_streaks;
create trigger couple_streaks_preserve_best_count
  before insert or update of current_count, best_count
  on public.couple_streaks
  for each row execute function public.preserve_couple_streak_best_count();

-- Repair the invariant for rows whose current streak is already above best.
-- Historical values that were already lost need the targeted recovery script.
update public.couple_streaks
set best_count = greatest(best_count, current_count)
where best_count < current_count;

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
  remaining_grace int := 0;
  missed_days int := 0;
  final_current int := 0;
  final_best int := 0;
  result public.couple_streaks;
begin
  select
    c.id,
    c.user_a,
    c.user_b,
    c.plan as legacy_plan,
    s.id as space_id
  into couple_row
  from public.couples c
  left join lateral (
    select candidate.id, candidate.owner_id
    from public.spaces candidate
    where candidate.id = c.id
       or candidate.legacy_couple_id = c.id
    order by (candidate.id = c.id) desc
    limit 1
  ) s on true
  where c.id = target_couple_id;

  if couple_row.id is null then
    return null;
  end if;

  couple_plan := case
    when couple_row.space_id is not null
      then coalesce(public.get_space_effective_plan(couple_row.space_id), 'free')
    else coalesce(couple_row.legacy_plan, 'free')
  end;
  grace_budget := case couple_plan
    when 'pro' then 3
    when 'plus' then 1
    else 0
  end;

  select
    current_count,
    best_count,
    last_completed_date,
    grace_used_this_month,
    grace_month,
    streak_bonus_count
  into existing
  from public.couple_streaks
  where couple_id = target_couple_id;

  v_grace_month := coalesce(existing.grace_month, '');
  v_grace_used := greatest(coalesce(existing.grace_used_this_month, 0), 0);
  if v_grace_month <> current_month then
    v_grace_used := 0;
    v_grace_month := current_month;
  end if;

  delete from public.couple_streak_days
  where couple_id = target_couple_id;

  insert into public.couple_streak_days (
    couple_id,
    space_id,
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
      count(*) filter (where p.created_by = couple_row.user_a)::int as a_count,
      count(*) filter (where p.created_by = couple_row.user_b)::int as b_count,
      max(p.created_at) as latest
    from public.pins p
    where p.couple_id = target_couple_id
       or (
         couple_row.space_id is not null
         and p.space_id = couple_row.space_id
       )
    group by (p.created_at at time zone streak_tz)::date
  )
  select
    target_couple_id,
    couple_row.space_id,
    streak_date,
    a_count,
    b_count,
    a_count > 0,
    b_count > 0,
    a_count > 0 and b_count > 0,
    case when a_count > 0 and b_count > 0 then latest else null end,
    now()
  from daily;

  select user_a_posted, user_b_posted, completed
  into today_a, today_b, today_done
  from public.couple_streak_days
  where couple_id = target_couple_id
    and streak_date = streak_today;

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

    longest_run := greatest(longest_run, run_count);
    last_completed := day_row.streak_date;
    previous_completed_date := day_row.streak_date;
  end loop;

  final_current := greatest(coalesce(existing.current_count, 0), 0);
  remaining_grace := greatest(grace_budget - v_grace_used, 0);

  if coalesce(today_done, false) then
    if existing.last_completed_date = streak_today then
      null;
    elsif existing.last_completed_date = streak_today - 1 then
      final_current := final_current + 1;
    elsif existing.last_completed_date is not null
      and existing.last_completed_date < streak_today
    then
      missed_days := greatest(
        streak_today - existing.last_completed_date - 1,
        0
      );

      if missed_days <= remaining_grace then
        v_grace_used := v_grace_used + missed_days;
        final_current := final_current + 1;
      else
        final_current := 1;
      end if;
    else
      final_current := 1;
    end if;

    last_completed := streak_today;
  elsif existing.last_completed_date is not null then
    -- Do not charge grace while today is still open. The charge is applied
    -- exactly once when a later day is completed and closes the gap.
    missed_days := greatest(
      streak_today - existing.last_completed_date - 1,
      0
    );

    if missed_days > remaining_grace then
      final_current := 0;
    end if;
  end if;

  final_best := greatest(
    longest_run,
    final_current,
    coalesce(existing.best_count, 0)
  );

  insert into public.couple_streaks (
    couple_id,
    space_id,
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
    couple_row.space_id,
    final_current,
    final_best,
    coalesce(last_completed, existing.last_completed_date),
    streak_today,
    coalesce(today_a, false),
    coalesce(today_b, false),
    coalesce(today_done, false),
    greatest(coalesce(existing.streak_bonus_count, 0), 0),
    v_grace_used,
    v_grace_month,
    streak_tz,
    now()
  )
  on conflict (couple_id) do update
  set
    space_id = excluded.space_id,
    current_count = excluded.current_count,
    best_count = greatest(public.couple_streaks.best_count, excluded.best_count),
    last_completed_date = excluded.last_completed_date,
    today_date = excluded.today_date,
    today_user_a_posted = excluded.today_user_a_posted,
    today_user_b_posted = excluded.today_user_b_posted,
    today_completed = excluded.today_completed,
    streak_bonus_count = excluded.streak_bonus_count,
    grace_used_this_month = excluded.grace_used_this_month,
    grace_month = excluded.grace_month,
    timezone = excluded.timezone,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.preserve_couple_streak_best_count()
  from public, anon, authenticated;
