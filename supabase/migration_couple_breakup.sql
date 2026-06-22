-- Couple breakup reset flow.
-- Allows either member to end a couple, clear both membership locks, and
-- return both accounts to the setup flow after server-side media cleanup.

create table if not exists public.couple_lifecycle_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('couple_ended')),
  initiator_user_id uuid references public.users(id),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_couple_lifecycle_notices_user_unread
  on public.couple_lifecycle_notices(user_id, read_at, created_at desc);

alter table public.couple_lifecycle_notices enable row level security;

drop policy if exists "Users can read own lifecycle notices"
  on public.couple_lifecycle_notices;
create policy "Users can read own lifecycle notices"
  on public.couple_lifecycle_notices for select
  using (user_id = auth.uid());

drop policy if exists "Users can mark own lifecycle notices read"
  on public.couple_lifecycle_notices;
create policy "Users can mark own lifecycle notices read"
  on public.couple_lifecycle_notices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.finalize_couple_breakup(
  p_couple_id uuid,
  p_initiator_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple public.couples;
  v_member_ids uuid[];
  v_member_id uuid;
begin
  if p_couple_id is null or p_initiator_user_id is null then
    raise exception 'Missing breakup context' using errcode = 'P0001';
  end if;

  select *
    into v_couple
  from public.couples
  where id = p_couple_id
  for update;

  if v_couple.id is null then
    raise exception 'Couple not found' using errcode = 'P0001';
  end if;

  if p_initiator_user_id is distinct from v_couple.user_a
    and p_initiator_user_id is distinct from v_couple.user_b
  then
    raise exception 'Not a couple member' using errcode = 'P0002';
  end if;

  v_member_ids := array_remove(array[v_couple.user_a, v_couple.user_b], null);

  perform 1
  from public.users
  where id = any(v_member_ids)
  for update;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  foreach v_member_id in array v_member_ids loop
    insert into public.couple_lifecycle_notices (
      user_id,
      type,
      initiator_user_id,
      message
    )
    values (
      v_member_id,
      'couple_ended',
      p_initiator_user_id,
      case
        when v_member_id = p_initiator_user_id then
          'Couple cũ đã được kết thúc. Bạn có thể tạo hoặc nhập mã couple mới.'
        else
          'Couple này đã được kết thúc. Tất cả kỷ niệm của hai bạn đã được xoá.'
      end
    );
  end loop;

  update public.activation_codes
  set
    used_by_couple_id = null,
    expires_at = least(coalesce(expires_at, now()), now())
  where used_by_couple_id = p_couple_id;

  update public.bucket_list
  set completed_pin_id = null
  where couple_id = p_couple_id
    and completed_pin_id is not null;

  update public.users
  set
    couple_id = null,
    first_couple_id = null,
    couple_locked_at = null
  where id = any(v_member_ids);

  delete from public.couples
  where id = p_couple_id;

  return jsonb_build_object(
    'ok', true,
    'coupleId', p_couple_id,
    'memberIds', to_jsonb(v_member_ids)
  );
end;
$$;

revoke all on function public.finalize_couple_breakup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_couple_breakup(uuid, uuid)
  to service_role;
