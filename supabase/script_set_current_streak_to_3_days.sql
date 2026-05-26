-- One-time helper: make the visible current streak at least 3 days.
--
-- Invite code is prefilled for this couple. Run in Supabase SQL Editor after
-- migration_streak_persistent_bonus.sql.
--
-- This uses streak_bonus_count instead of fake streak days, so the correction
-- survives refreshes triggered by new memories, edits, deletes, and reminders.

alter table public.couple_streaks
  add column if not exists streak_bonus_count int not null default 0;

do $$
declare
  target_invite_code text := 'BB3938';
  target_couple_id uuid;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  refreshed public.couple_streaks;
  real_current int := 0;
  target_bonus int := 0;
begin
  select id
    into target_couple_id
    from public.couples
    where invite_code = upper(trim(target_invite_code));

  if target_couple_id is null then
    raise exception 'Couple invite code % was not found.', target_invite_code;
  end if;

  select *
    into refreshed
    from public.refresh_couple_streak(target_couple_id);

  real_current := greatest(
    coalesce(refreshed.current_count, 0) - coalesce(refreshed.streak_bonus_count, 0),
    0
  );
  target_bonus := greatest(3 - real_current, 0);

  insert into public.couple_streaks (
    couple_id,
    current_count,
    best_count,
    last_completed_date,
    today_date,
    streak_bonus_count,
    timezone,
    updated_at
  )
  values (
    target_couple_id,
    0,
    0,
    today - 1,
    today,
    target_bonus,
    'Asia/Ho_Chi_Minh',
    now()
  )
  on conflict (couple_id) do update
    set streak_bonus_count = target_bonus,
        last_completed_date = case
          when public.couple_streaks.current_count > 0 then public.couple_streaks.last_completed_date
          else today - 1
        end,
        updated_at = now();

  select *
    into refreshed
    from public.refresh_couple_streak(target_couple_id);

  delete from public.streak_reminder_logs
    where couple_id = target_couple_id
      and reminder_date = today;

  raise notice 'Updated streak for %, current_count=%, best_count=%, streak_bonus_count=%',
    target_invite_code,
    refreshed.current_count,
    refreshed.best_count,
    refreshed.streak_bonus_count;
end $$;

select
  current_count,
  best_count,
  last_completed_date,
  today_date,
  today_user_a_posted,
  today_user_b_posted,
  today_completed,
  streak_bonus_count
from public.couple_streaks
where couple_id = (
  select id from public.couples where invite_code = 'BB3938'
);
