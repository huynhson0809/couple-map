-- Solo daily streak reminder targets.
-- A user is eligible when their active space has exactly one active member
-- and no memory has been saved in that space on the requested VN date.
-- Run after migration_space_downgrade_access.sql.

create or replace function public.get_solo_streak_reminder_targets(
  p_reminder_date date
)
returns table (
  space_id uuid,
  couple_id uuid,
  user_id uuid,
  space_name text
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
    s.name as space_name
  from public.users u
  join public.spaces s
    on s.id = u.active_space_id
  join public.space_members viewer_membership
    on viewer_membership.space_id = s.id
   and viewer_membership.user_id = u.id
   and viewer_membership.status = 'active'
  join public.couples c
    on c.id = s.legacy_couple_id
  where p_reminder_date is not null
    and public.is_space_writable(s.id)
    and (
      select count(*)
      from public.space_members active_members
      where active_members.space_id = s.id
        and active_members.status = 'active'
    ) = 1
    and not exists (
      select 1
      from public.pins p
      where (
          p.space_id = s.id
          or (p.space_id is null and p.couple_id = s.legacy_couple_id)
        )
        and (p.created_at at time zone 'Asia/Ho_Chi_Minh')::date = p_reminder_date
    );
$$;

revoke all on function public.get_solo_streak_reminder_targets(date)
  from public, anon, authenticated;
grant execute on function public.get_solo_streak_reminder_targets(date)
  to service_role;
