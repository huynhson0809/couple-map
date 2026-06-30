-- Delete-space RPC patch.
-- Run this file instead of re-running migration_memory_spaces.sql on an existing project.

create or replace function public.delete_space_for_current_user(space_id uuid)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_target_space_id uuid := space_id;
  v_space public.spaces;
  v_fallback_space public.spaces;
  v_active_space_count integer;
  v_fallback_legacy_couple_id uuid;
  v_member_ids uuid[];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_space
  from public.spaces
  where id = v_target_space_id
  for update;

  if v_space.id is null then
    raise exception 'space_not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.space_members sm
    where sm.space_id = v_space.id
      and sm.user_id = uid
      and sm.status = 'active'
      and sm.role = 'owner'
  ) then
    raise exception 'space_delete_owner_required' using errcode = 'P0002';
  end if;

  select count(*)
    into v_active_space_count
  from public.space_members sm
  where sm.user_id = uid
    and sm.status = 'active';

  if v_active_space_count < 2 then
    raise exception 'space_delete_last_space' using errcode = 'P0002';
  end if;

  select s.*
    into v_fallback_space
  from public.space_members sm
  join public.spaces s on s.id = sm.space_id
  where sm.user_id = uid
    and sm.status = 'active'
    and sm.space_id <> v_space.id
  order by (sm.role = 'owner') desc, sm.joined_at desc
  limit 1;

  if v_fallback_space.id is null then
    raise exception 'space_delete_last_space' using errcode = 'P0002';
  end if;

  v_fallback_legacy_couple_id := public.ensure_space_legacy_couple(
    v_fallback_space.id
  );

  select coalesce(array_agg(sm.user_id order by sm.joined_at), '{}'::uuid[])
    into v_member_ids
  from public.space_members sm
  where sm.space_id = v_space.id
    and sm.status = 'active';

  perform 1
  from public.users
  where id = any(v_member_ids)
     or active_space_id = v_space.id
     or couple_id = v_space.id
     or (
       v_space.legacy_couple_id is not null
       and couple_id = v_space.legacy_couple_id
     )
     or first_couple_id = v_space.id
     or (
       v_space.legacy_couple_id is not null
       and first_couple_id = v_space.legacy_couple_id
     )
  for update;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.activation_codes
  set
    used_by_couple_id = null,
    expires_at = least(coalesce(expires_at, now()), now())
  where used_by_couple_id = v_space.legacy_couple_id;

  update public.bucket_list
  set completed_pin_id = null
  where (
      couple_id = v_space.id
      or (
        v_space.legacy_couple_id is not null
        and couple_id = v_space.legacy_couple_id
      )
    )
    and completed_pin_id is not null;

  update public.users
  set
    active_space_id = case
      when id = uid and active_space_id = v_space.id then v_fallback_space.id
      when active_space_id = v_space.id then null
      else active_space_id
    end,
    couple_id = case
      when id = uid
        and (
          couple_id = v_space.id
          or (
            v_space.legacy_couple_id is not null
            and couple_id = v_space.legacy_couple_id
          )
        )
        then coalesce(v_fallback_legacy_couple_id, couple_id)
      when couple_id = v_space.id
        or (
          v_space.legacy_couple_id is not null
          and couple_id = v_space.legacy_couple_id
        )
        then null
      else couple_id
    end,
    first_couple_id = case
      when first_couple_id = v_space.id
        or (
          v_space.legacy_couple_id is not null
          and first_couple_id = v_space.legacy_couple_id
        )
        then null
      else first_couple_id
    end,
    couple_locked_at = case
      when couple_id = v_space.id
        or (
          v_space.legacy_couple_id is not null
          and couple_id = v_space.legacy_couple_id
        )
        or first_couple_id = v_space.id
        or (
          v_space.legacy_couple_id is not null
          and first_couple_id = v_space.legacy_couple_id
        )
        then null
      else couple_locked_at
    end
  where id = any(v_member_ids)
     or active_space_id = v_space.id
     or couple_id = v_space.id
     or (
       v_space.legacy_couple_id is not null
       and couple_id = v_space.legacy_couple_id
     )
     or first_couple_id = v_space.id
     or (
       v_space.legacy_couple_id is not null
       and first_couple_id = v_space.legacy_couple_id
     );

  delete from public.spaces
  where id = v_space.id;

  if not found then
    raise exception 'space_delete_failed' using errcode = 'P0001';
  end if;

  if v_space.legacy_couple_id is not null then
    delete from public.couples
    where id = v_space.legacy_couple_id;
  end if;

  return v_space;
end;
$$;

revoke all on function public.delete_space_for_current_user(uuid)
  from public, anon;
grant execute on function public.delete_space_for_current_user(uuid)
  to authenticated;
