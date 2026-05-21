-- Notification preferences for Pinly.
-- Run in Supabase SQL Editor.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  memory_added boolean not null default true,
  reactions boolean not null default true,
  comments boolean not null default true,
  streak_reminders boolean not null default true,
  updated_at timestamptz default now()
);

alter table public.notification_preferences
  add column if not exists streak_reminders boolean not null default true;

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can read own notification preferences"
  on public.notification_preferences;
drop policy if exists "Users can insert own notification preferences"
  on public.notification_preferences;
drop policy if exists "Users can update own notification preferences"
  on public.notification_preferences;

create policy "Users can read own notification preferences"
  on public.notification_preferences for select
  using (user_id = auth.uid());

create policy "Users can insert own notification preferences"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update own notification preferences"
  on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists notification_preferences_updated_at
  on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function update_updated_at();
