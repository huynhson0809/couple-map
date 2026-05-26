-- Couple streaks for Pinly.
-- A streak day is completed only when both partners add at least one memory.
-- Run in Supabase SQL Editor.

alter table if exists public.notification_preferences
  add column if not exists streak_reminders boolean not null default true;

alter table if exists public.notification_preferences
  add column if not exists streak_email_reminders boolean not null default false;

create table if not exists public.couple_streak_days (
  couple_id uuid references public.couples(id) on delete cascade not null,
  streak_date date not null,
  user_a_pin_count int not null default 0,
  user_b_pin_count int not null default 0,
  user_a_posted boolean not null default false,
  user_b_posted boolean not null default false,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz default now(),
  primary key (couple_id, streak_date)
);

create table if not exists public.couple_streaks (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  current_count int not null default 0,
  best_count int not null default 0,
  last_completed_date date,
  today_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  today_user_a_posted boolean not null default false,
  today_user_b_posted boolean not null default false,
  today_completed boolean not null default false,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  updated_at timestamptz default now()
);

create table if not exists public.streak_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  reminder_date date not null,
  reminder_hour int not null check (reminder_hour between 0 and 23),
  created_at timestamptz default now(),
  unique (couple_id, reminder_date, reminder_hour)
);

create index if not exists idx_couple_streak_days_couple_date
  on public.couple_streak_days(couple_id, streak_date desc);
create index if not exists idx_couple_streak_days_completed
  on public.couple_streak_days(couple_id, completed, streak_date desc);
create index if not exists idx_streak_reminder_logs_lookup
  on public.streak_reminder_logs(couple_id, reminder_date, reminder_hour);

alter table public.couple_streak_days enable row level security;
alter table public.couple_streaks enable row level security;
alter table public.streak_reminder_logs enable row level security;

drop policy if exists "Couple members can read streak days"
  on public.couple_streak_days;
drop policy if exists "Couple members can read streak summary"
  on public.couple_streaks;
drop policy if exists "Users can read own couple streak reminder logs"
  on public.streak_reminder_logs;

create policy "Couple members can read streak days"
  on public.couple_streak_days for select
  using (couple_id = get_my_couple_id());

create policy "Couple members can read streak summary"
  on public.couple_streaks for select
  using (couple_id = get_my_couple_id());

create policy "Users can read own couple streak reminder logs"
  on public.streak_reminder_logs for select
  using (couple_id = get_my_couple_id());

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

  -- The current day is still open, so an incomplete today must not break
  -- the visible streak. We only require completed days up to yesterday
  -- until both people have saved a memory today.
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

create or replace function public.refresh_couple_streak_from_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_couple_streak(old.couple_id);
    return old;
  end if;

  perform public.refresh_couple_streak(new.couple_id);

  if tg_op = 'UPDATE' and old.couple_id is distinct from new.couple_id then
    perform public.refresh_couple_streak(old.couple_id);
  end if;

  return new;
end;
$$;

drop trigger if exists pins_refresh_couple_streak_insert
  on public.pins;
create trigger pins_refresh_couple_streak_insert
  after insert on public.pins
  for each row execute function public.refresh_couple_streak_from_pin();

drop trigger if exists pins_refresh_couple_streak_update
  on public.pins;
create trigger pins_refresh_couple_streak_update
  after update of couple_id, created_by, created_at on public.pins
  for each row execute function public.refresh_couple_streak_from_pin();

drop trigger if exists pins_refresh_couple_streak_delete
  on public.pins;
create trigger pins_refresh_couple_streak_delete
  after delete on public.pins
  for each row execute function public.refresh_couple_streak_from_pin();

create or replace function public.refresh_couple_streak_from_couple()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_couple_streak(new.id);
  return new;
end;
$$;

drop trigger if exists couples_refresh_couple_streak_members
  on public.couples;
create trigger couples_refresh_couple_streak_members
  after insert or update of user_a, user_b on public.couples
  for each row execute function public.refresh_couple_streak_from_couple();

do $$
declare
  c record;
begin
  for c in select id from public.couples loop
    perform public.refresh_couple_streak(c.id);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_streak_days'
  ) then
    alter publication supabase_realtime add table public.couple_streak_days;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_streaks'
  ) then
    alter publication supabase_realtime add table public.couple_streaks;
  end if;
end $$;
