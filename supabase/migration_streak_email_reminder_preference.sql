-- Add opt-in email reminders for daily streaks.
-- Default is intentionally off; users must enable this in Settings.

alter table public.notification_preferences
  add column if not exists streak_email_reminders boolean not null default false;
