-- One-time helper: add 3 durable bonus days to the current visible streak.
--
-- Invite code is prefilled for this couple. Run in Supabase SQL Editor after
-- migration_streak_persistent_bonus.sql.
--
-- This updates streak_bonus_count instead of inserting fake streak days.
-- refresh_couple_streak rebuilds couple_streak_days from real pins, so fake
-- days would disappear on the next pin/reminder refresh.

alter table public.couple_streaks
  add column if not exists streak_bonus_count int not null default 0;

do $$
declare
  target_invite_code text := 'BB3938';
  target_couple_id uuid;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  refreshed public.couple_streaks;
begin
  select id
    into target_couple_id
    from public.couples
    where invite_code = upper(trim(target_invite_code));

  if target_couple_id is null then
    raise exception 'Couple invite code % was not found.', target_invite_code;
  end if;

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
    3,
    'Asia/Ho_Chi_Minh',
    now()
  )
  on conflict (couple_id) do update
    set streak_bonus_count = greatest(public.couple_streaks.streak_bonus_count, 0) + 3,
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
