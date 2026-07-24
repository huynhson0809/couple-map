-- Per-user locale/timezone and recipient-aware streak reminders.
-- Run after migration_user_consents.sql, migration_solo_streak_reminders.sql,
-- and migration_streak_plan_grace.sql.

alter table public.users
  add column if not exists locale text,
  add column if not exists timezone text;

-- Preserve the behavior existing accounts already had before preferences were
-- stored. New accounts receive their device preferences during signup/login.
update public.users
set locale = coalesce(locale, 'vi'),
    timezone = coalesce(timezone, 'Asia/Ho_Chi_Minh')
where locale is null or timezone is null;

create or replace function public.validate_user_locale_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.locale is not null and new.locale not in ('en', 'vi') then
    raise exception 'Unsupported locale: %', new.locale using errcode = '22023';
  end if;

  if new.timezone is not null and not exists (
    select 1 from pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Unsupported timezone: %', new.timezone using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_locale_timezone on public.users;
create trigger validate_user_locale_timezone
  before insert or update of locale, timezone on public.users
  for each row execute function public.validate_user_locale_timezone();

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
begin
  insert into public.users (id, email, display_name, locale, timezone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when requested_locale in ('en', 'vi') then requested_locale else null end,
    case
      when exists (
        select 1 from pg_timezone_names where name = requested_timezone
      ) then requested_timezone
      else null
    end
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

alter table public.streak_reminder_logs
  add column if not exists recipient_user_id uuid
    references public.users(id) on delete cascade;

alter table public.streak_reminder_logs
  drop constraint if exists streak_reminder_logs_couple_id_reminder_date_reminder_hour_key;

drop index if exists public.idx_streak_reminder_logs_recipient_window;
create unique index idx_streak_reminder_logs_recipient_window
  on public.streak_reminder_logs(
    couple_id,
    recipient_user_id,
    reminder_date,
    reminder_hour
  );

create index if not exists idx_streak_reminder_logs_recipient
  on public.streak_reminder_logs(recipient_user_id, reminder_date desc);

-- Candidate discovery is intentionally date-agnostic. The Edge Function checks
-- each candidate against that recipient's own local date and day boundaries.
create or replace function public.get_solo_streak_reminder_targets_v2()
returns table (
  space_id uuid,
  couple_id uuid,
  user_id uuid,
  space_name text,
  locale text,
  timezone text
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    s.id as space_id,
    s.legacy_couple_id as couple_id,
    u.id as user_id,
    s.name as space_name,
    case when u.locale in ('en', 'vi') then u.locale else 'en' end as locale,
    case
      when exists (
        select 1 from pg_timezone_names tz where tz.name = u.timezone
      ) then u.timezone
      else 'UTC'
    end as timezone
  from public.users u
  join public.spaces s
    on s.id = u.active_space_id
  join public.space_members viewer_membership
    on viewer_membership.space_id = s.id
   and viewer_membership.user_id = u.id
   and viewer_membership.status = 'active'
  join public.couples c
    on c.id = s.legacy_couple_id
  where public.is_space_writable(s.id)
    and (
      select count(*)
      from public.space_members active_members
      where active_members.space_id = s.id
        and active_members.status = 'active'
    ) = 1;
$$;

revoke all on function public.get_solo_streak_reminder_targets_v2()
  from public, anon, authenticated;
grant execute on function public.get_solo_streak_reminder_targets_v2()
  to service_role;

-- This is the plan-grace version of refresh_couple_streak. Its only behavioral
-- change is choosing a stable timezone from the existing streak or space owner.
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

  select current_count, best_count, last_completed_date,
         grace_used_this_month, grace_month, streak_bonus_count, timezone
    into existing
    from public.couple_streaks
    where couple_id = target_couple_id;

  streak_tz := coalesce(
    nullif(existing.timezone, ''),
    (select nullif(timezone, '') from public.users where id = couple_row.user_a),
    (select nullif(timezone, '') from public.users where id = couple_row.user_b),
    'UTC'
  );
  if not exists (select 1 from pg_timezone_names where name = streak_tz) then
    streak_tz := 'UTC';
  end if;

  streak_today := (now() at time zone streak_tz)::date;
  current_month := to_char(streak_today, 'YYYY-MM');

  v_grace_month := coalesce(existing.grace_month, '');
  v_grace_used := coalesce(existing.grace_used_this_month, 0);
  if v_grace_month <> current_month then
    v_grace_used := 0;
    v_grace_month := current_month;
  end if;

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

  select user_a_posted, user_b_posted, completed
    into today_a, today_b, today_done
    from public.couple_streak_days
    where couple_id = target_couple_id and streak_date = streak_today;

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

  final_current := coalesce(existing.current_count, 0);

  if coalesce(today_done, false) then
    if existing.last_completed_date = streak_today then
      null;
    elsif existing.last_completed_date = streak_today - 1 then
      final_current := final_current + 1;
    elsif existing.last_completed_date is not null
      and (streak_today - existing.last_completed_date) <= (grace_budget - v_grace_used + 1)
    then
      v_grace_used := v_grace_used + (streak_today - existing.last_completed_date - 1);
      final_current := final_current + 1;
    else
      final_current := 1;
    end if;
    last_completed := streak_today;
  else
    if existing.last_completed_date is not null then
      declare
        days_since int := streak_today - existing.last_completed_date;
      begin
        if days_since <= 1 then
          null;
        elsif days_since <= (grace_budget - v_grace_used + 1) then
          null;
        else
          final_current := 0;
        end if;
      end;
    end if;
  end if;

  final_best := greatest(longest_run, final_current, coalesce(existing.best_count, 0));

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
        best_count = greatest(public.couple_streaks.best_count, excluded.best_count),
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
