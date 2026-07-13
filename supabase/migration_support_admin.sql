-- Desktop support administration for Pinly.
-- Run after migration_support_tickets.sql and the notifications migrations.

create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null default 'support' check (role in ('support', 'admin')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_pinly_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.role in ('support', 'admin')
    );
$$;

revoke all on function public.is_pinly_admin() from public, anon;
grant execute on function public.is_pinly_admin() to authenticated;

drop policy if exists "Admins can read all support tickets"
  on public.support_tickets;
create policy "Admins can read all support tickets"
  on public.support_tickets for select
  using (public.is_pinly_admin());

create or replace function public.admin_list_support_tickets(
  p_status text default null,
  p_kind text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  ticket_id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  kind text,
  subject text,
  message text,
  status text,
  admin_reply text,
  context jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_pinly_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;

  if p_status is not null
    and p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception using errcode = '22023', message = 'invalid_support_status';
  end if;

  if p_kind is not null and p_kind not in ('question', 'bug') then
    raise exception using errcode = '22023', message = 'invalid_support_kind';
  end if;

  return query
  select
    st.id,
    st.user_id,
    u.email,
    u.display_name,
    st.kind,
    st.subject,
    st.message,
    st.status,
    st.admin_reply,
    st.context,
    st.created_at,
    st.updated_at,
    st.resolved_at
  from public.support_tickets st
  left join public.users u on u.id = st.user_id
  where (p_status is null or st.status = p_status)
    and (p_kind is null or st.kind = p_kind)
    and (
      v_search is null
      or st.subject ilike '%' || v_search || '%'
      or st.message ilike '%' || v_search || '%'
      or coalesce(u.email, '') ilike '%' || v_search || '%'
      or coalesce(u.display_name, '') ilike '%' || v_search || '%'
      or st.id::text ilike '%' || v_search || '%'
    )
  order by
    case st.status
      when 'open' then 0
      when 'in_progress' then 1
      when 'resolved' then 2
      else 3
    end,
    st.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_support_tickets(text, text, text, integer, integer)
  from public, anon;
grant execute on function public.admin_list_support_tickets(text, text, text, integer, integer)
  to authenticated;

create or replace function public.admin_support_ticket_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_pinly_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where status = 'open'),
    'inProgress', count(*) filter (where status = 'in_progress'),
    'resolved', count(*) filter (where status = 'resolved'),
    'closed', count(*) filter (where status = 'closed'),
    'bugs', count(*) filter (where kind = 'bug'),
    'questions', count(*) filter (where kind = 'question')
  )
  into v_result
  from public.support_tickets;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_support_ticket_counts()
  from public, anon;
grant execute on function public.admin_support_ticket_counts()
  to authenticated;

create or replace function public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_status text,
  p_admin_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.support_tickets%rowtype;
  v_after public.support_tickets%rowtype;
  v_reply text := nullif(trim(coalesce(p_admin_reply, '')), '');
begin
  if not public.is_pinly_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;

  if p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception using errcode = '22023', message = 'invalid_support_status';
  end if;

  if v_reply is not null and char_length(v_reply) > 4000 then
    raise exception using errcode = '22001', message = 'support_reply_too_long';
  end if;

  select *
    into v_before
  from public.support_tickets st
  where st.id = p_ticket_id
  for update;

  if v_before.id is null then
    raise exception using errcode = 'P0002', message = 'support_ticket_not_found';
  end if;

  update public.support_tickets st
  set
    status = p_status,
    admin_reply = v_reply
  where st.id = p_ticket_id
  returning * into v_after;

  if v_reply is not null and v_reply is distinct from v_before.admin_reply then
    insert into public.notifications (
      user_id,
      couple_id,
      space_id,
      type,
      title,
      body,
      data
    )
    values (
      v_after.user_id,
      null,
      null,
      'support_reply',
      'support_reply',
      left(v_after.subject, 180),
      jsonb_build_object('support_ticket_id', v_after.id)
    );
  end if;

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.admin_update_support_ticket(uuid, text, text)
  from public, anon;
grant execute on function public.admin_update_support_ticket(uuid, text, text)
  to authenticated;

-- Support replies belong to the account rather than a single memory space.
-- Keep the existing space-aware feed behavior while including those replies in
-- every valid active space selected by the user.
create or replace function public.get_notification_feed(
  p_limit integer default 30,
  p_offset integer default 0,
  p_space_id uuid default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_limit, 30), 1), 50) as limit_value,
      greatest(coalesce(p_offset, 0), 0) as offset_value
  ),
  target_space as (
    select s.id, s.legacy_couple_id
    from public.spaces s
    join public.space_members sm on sm.space_id = s.id
    where auth.uid() is not null
      and s.id = p_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
    limit 1
  ),
  page as (
    select
      n.id,
      n.user_id,
      n.couple_id,
      coalesce(n.space_id, ts.id) as space_id,
      n.type,
      n.title,
      n.body,
      n.data,
      n.read,
      n.created_at
    from public.notifications n
    join target_space ts on true
    where auth.uid() is not null
      and n.user_id = auth.uid()
      and p_space_id is not null
      and (
        n.type = 'support_reply'
        or n.space_id = ts.id
        or (
          n.space_id is null
          and n.couple_id in (ts.id, ts.legacy_couple_id)
        )
      )
    order by n.created_at desc
    limit (select limit_value from bounds)
    offset (select offset_value from bounds)
  )
  select jsonb_build_object(
    'notifications',
    coalesce(
      (select jsonb_agg(to_jsonb(page) order by page.created_at desc) from page),
      '[]'::jsonb
    ),
    'unreadCount',
    coalesce(
      (
        select count(*)
        from public.notifications n
        join target_space ts on true
        where auth.uid() is not null
          and n.user_id = auth.uid()
          and n.read = false
          and p_space_id is not null
          and (
            n.type = 'support_reply'
            or n.space_id = ts.id
            or (
              n.space_id is null
              and n.couple_id in (ts.id, ts.legacy_couple_id)
            )
          )
      ),
      0
    )
  );
$$;

revoke all on function public.get_notification_feed(integer, integer, uuid)
  from public, anon;
grant execute on function public.get_notification_feed(integer, integer, uuid)
  to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.support_tickets;
exception
  when duplicate_object then null;
end;
$$;
