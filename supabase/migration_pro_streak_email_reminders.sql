-- Keep streak email reminders exclusive to active Pro accounts.

create or replace function public.enforce_pro_streak_email_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.streak_email_reminders, false)
    and public.get_account_plan(new.user_id) <> 'pro'
  then
    new.streak_email_reminders := false;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pro_streak_email_reminders()
  from public, anon, authenticated;

drop trigger if exists enforce_pro_streak_email_reminders
  on public.notification_preferences;
create trigger enforce_pro_streak_email_reminders
  before insert or update of streak_email_reminders
  on public.notification_preferences
  for each row execute function public.enforce_pro_streak_email_reminders();

update public.notification_preferences p
set streak_email_reminders = false,
    updated_at = now()
where p.streak_email_reminders = true
  and public.get_account_plan(p.user_id) <> 'pro';
