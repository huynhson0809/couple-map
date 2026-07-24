-- Stable, international streak days.
-- Run after migration_user_locale_timezone_reminders.sql and
-- migration_streak_best_monotonic.sql.

alter table public.users
  add column if not exists timezone_confirmed boolean not null default false;

alter table public.couples
  add column if not exists streak_timezone text;

-- Accounts created after timezone metadata was added already supplied a real
-- device timezone. Legacy backfilled values remain unconfirmed until the app
-- sees that user again.
update public.users u
set timezone_confirmed = true
from auth.users auth_user
where auth_user.id = u.id
  and coalesce(auth_user.raw_user_meta_data->>'timezone', '') <> ''
  and u.timezone = auth_user.raw_user_meta_data->>'timezone'
  and exists (
    select 1
    from pg_timezone_names tz
    where tz.name = u.timezone
  );

create or replace function public.validate_couple_streak_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.streak_timezone is not null and not exists (
    select 1
    from pg_timezone_names tz
    where tz.name = new.streak_timezone
  ) then
    raise exception 'Unsupported streak timezone: %', new.streak_timezone
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_couple_streak_timezone on public.couples;
create trigger validate_couple_streak_timezone
  before insert or update of streak_timezone on public.couples
  for each row execute function public.validate_couple_streak_timezone();

-- Initialize only from a timezone that has been observed on a real device.
-- Unresolved legacy spaces stay null so a later login can correct the old
-- Asia/Ho_Chi_Minh backfill instead of locking it forever.
update public.couples c
set streak_timezone = coalesce(
  (
    select u.timezone
    from public.users u
    where u.id = c.user_a
      and u.timezone_confirmed = true
      and exists (
        select 1 from pg_timezone_names tz where tz.name = u.timezone
      )
  ),
  (
    select u.timezone
    from public.users u
    where u.id = c.user_b
      and u.timezone_confirmed = true
      and exists (
        select 1 from pg_timezone_names tz where tz.name = u.timezone
      )
  )
)
where c.streak_timezone is null;

-- Keep signup metadata and the public profile row in sync for new accounts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  consent jsonb := coalesce(new.raw_user_meta_data->'consent', '{}'::jsonb);
  requested_locale text := new.raw_user_meta_data->>'locale';
  requested_timezone text := new.raw_user_meta_data->>'timezone';
  valid_timezone boolean := exists (
    select 1 from pg_timezone_names where name = requested_timezone
  );
begin
  insert into public.users (
    id,
    email,
    display_name,
    locale,
    timezone,
    timezone_confirmed
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    ),
    case when requested_locale in ('en', 'vi') then requested_locale else null end,
    case when valid_timezone then requested_timezone else null end,
    valid_timezone
  );

  if consent->>'terms_version' = '2026-06-07'
    and consent->>'privacy_version' = '2026-06-07'
    and consent->>'source' = 'signup'
  then
    insert into public.user_consents (
      user_id,
      terms_version,
      privacy_version,
      source
    )
    values (
      new.id,
      consent->>'terms_version',
      consent->>'privacy_version',
      'signup'
    );
  end if;

  return new;
end;
$$;

create or replace function public.resolve_couple_streak_timezone(
  target_couple_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  couple_row record;
  resolved_timezone text;
  legacy_timezone text;
begin
  select id, user_a, user_b, streak_timezone
  into couple_row
  from public.couples
  where id = target_couple_id;

  if couple_row.id is null then
    return 'UTC';
  end if;

  if couple_row.streak_timezone is not null and exists (
    select 1
    from pg_timezone_names tz
    where tz.name = couple_row.streak_timezone
  ) then
    return couple_row.streak_timezone;
  end if;

  select u.timezone
  into resolved_timezone
  from public.users u
  where u.id in (couple_row.user_a, couple_row.user_b)
    and u.timezone_confirmed = true
    and exists (
      select 1 from pg_timezone_names tz where tz.name = u.timezone
    )
  order by case when u.id = couple_row.user_a then 0 else 1 end
  limit 1;

  if resolved_timezone is not null then
    update public.couples
    set streak_timezone = resolved_timezone
    where id = target_couple_id
      and streak_timezone is null;
    return resolved_timezone;
  end if;

  -- Preserve legacy behavior only as a temporary fallback. It is deliberately
  -- not copied to couples.streak_timezone until a device confirms its zone.
  select timezone
  into legacy_timezone
  from public.couple_streaks
  where couple_id = target_couple_id;

  if legacy_timezone is not null and exists (
    select 1 from pg_timezone_names tz where tz.name = legacy_timezone
  ) then
    return legacy_timezone;
  end if;

  return 'UTC';
end;
$$;

revoke all on function public.resolve_couple_streak_timezone(uuid)
  from public, anon, authenticated;

alter table public.couple_streaks
  alter column timezone set default 'UTC',
  alter column today_date set default ((now() at time zone 'UTC')::date);

-- This is the best-count-monotonic, plan-aware implementation with one change:
-- every pin is bucketed in the stable timezone resolved for its space.
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
  streak_tz text;
  streak_today date;
  current_month text;
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
    streak_bonus_count,
    timezone
  into existing
  from public.couple_streaks
  where couple_id = target_couple_id;

  streak_tz := public.resolve_couple_streak_timezone(target_couple_id);
  streak_today := (now() at time zone streak_tz)::date;
  current_month := to_char(streak_today, 'YYYY-MM');

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

-- Rebuild rows that already have a confirmed timezone. Unconfirmed legacy rows
-- retain their current behavior until the next app session confirms a zone.
do $$
declare
  couple_row record;
begin
  for couple_row in
    select c.id
    from public.couples c
    where c.streak_timezone is not null
  loop
    perform public.refresh_couple_streak(couple_row.id);
  end loop;
end;
$$;
