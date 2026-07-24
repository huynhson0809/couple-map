-- Bidirectional support conversations for Pinly.
-- Run after migration_support_tickets.sql and migration_support_admin.sql.

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin')),
  sender_user_id uuid references public.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_thread
  on public.support_ticket_messages(ticket_id, created_at asc);

alter table public.support_ticket_messages enable row level security;
revoke all on table public.support_ticket_messages from anon, authenticated;

drop policy if exists "Users can read own support messages"
  on public.support_ticket_messages;
drop policy if exists "Admins can read all support messages"
  on public.support_ticket_messages;

create policy "Users can read own support messages"
  on public.support_ticket_messages for select
  using (
    exists (
      select 1
      from public.support_tickets st
      where st.id = support_ticket_messages.ticket_id
        and st.user_id = auth.uid()
    )
  );

create policy "Admins can read all support messages"
  on public.support_ticket_messages for select
  using (public.is_pinly_admin());

grant select on public.support_ticket_messages to authenticated;

create or replace function public.seed_support_ticket_initial_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_ticket_messages (
    ticket_id,
    sender_type,
    sender_user_id,
    body,
    created_at
  )
  values (new.id, 'user', new.user_id, new.message, new.created_at);
  return new;
end;
$$;

revoke all on function public.seed_support_ticket_initial_message()
  from public, anon, authenticated;

drop trigger if exists seed_support_ticket_initial_message
  on public.support_tickets;
create trigger seed_support_ticket_initial_message
  after insert on public.support_tickets
  for each row execute function public.seed_support_ticket_initial_message();

-- Preserve the history of tickets created before this migration.
insert into public.support_ticket_messages (
  ticket_id,
  sender_type,
  sender_user_id,
  body,
  created_at
)
select st.id, 'user', st.user_id, st.message, st.created_at
from public.support_tickets st
where not exists (
  select 1
  from public.support_ticket_messages stm
  where stm.ticket_id = st.id
    and stm.sender_type = 'user'
    and stm.body = st.message
    and stm.created_at = st.created_at
);

insert into public.support_ticket_messages (
  ticket_id,
  sender_type,
  sender_user_id,
  body,
  created_at
)
select st.id, 'admin', null, st.admin_reply, st.updated_at
from public.support_tickets st
where st.admin_reply is not null
  and trim(st.admin_reply) <> ''
  and not exists (
    select 1
    from public.support_ticket_messages stm
    where stm.ticket_id = st.id
      and stm.sender_type = 'admin'
      and stm.body = st.admin_reply
  );

create or replace function public.add_support_ticket_user_message(
  p_ticket_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_ticket public.support_tickets%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_message public.support_ticket_messages%rowtype;
  v_daily_count integer;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if char_length(v_body) < 1 then
    raise exception using errcode = '22023', message = 'support_message_required';
  end if;
  if char_length(v_body) > 4000 then
    raise exception using errcode = '22001', message = 'support_message_too_long';
  end if;

  select *
    into v_ticket
  from public.support_tickets st
  where st.id = p_ticket_id
    and st.user_id = uid
  for update;

  if v_ticket.id is null then
    raise exception using errcode = 'P0002', message = 'support_ticket_not_found';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'support_ticket_closed';
  end if;

  if exists (
    select 1
    from public.support_ticket_messages stm
    where stm.ticket_id = v_ticket.id
      and stm.sender_type = 'user'
      and stm.created_at > now() - interval '3 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'support_message_rate_limit';
  end if;

  select count(*)::integer
    into v_daily_count
  from public.support_ticket_messages stm
  join public.support_tickets st on st.id = stm.ticket_id
  where st.user_id = uid
    and stm.sender_type = 'user'
    and stm.created_at > now() - interval '24 hours';

  if v_daily_count >= 50 then
    raise exception using errcode = 'P0001', message = 'support_message_daily_limit';
  end if;

  insert into public.support_ticket_messages (
    ticket_id,
    sender_type,
    sender_user_id,
    body
  )
  values (v_ticket.id, 'user', uid, v_body)
  returning * into v_message;

  update public.support_tickets
  set status = 'open'
  where id = v_ticket.id;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'message_id', v_message.id,
    'status', 'open',
    'created_at', v_message.created_at
  );
end;
$$;

revoke all on function public.add_support_ticket_user_message(uuid, text)
  from public, anon;
grant execute on function public.add_support_ticket_user_message(uuid, text)
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
  v_message_id uuid;
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

  if v_reply is not null then
    insert into public.support_ticket_messages (
      ticket_id,
      sender_type,
      sender_user_id,
      body
    )
    values (v_before.id, 'admin', auth.uid(), v_reply)
    returning id into v_message_id;
  end if;

  update public.support_tickets st
  set
    status = p_status,
    admin_reply = coalesce(v_reply, st.admin_reply)
  where st.id = p_ticket_id
  returning * into v_after;

  if v_message_id is not null then
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
      left(v_reply, 180),
      jsonb_build_object(
        'support_ticket_id', v_after.id,
        'support_message_id', v_message_id
      )
    );
  end if;

  return to_jsonb(v_after) || jsonb_build_object('message_id', v_message_id);
end;
$$;

revoke all on function public.admin_update_support_ticket(uuid, text, text)
  from public, anon;
grant execute on function public.admin_update_support_ticket(uuid, text, text)
  to authenticated;

do $$
begin
  alter publication supabase_realtime
    add table public.support_ticket_messages;
exception
  when duplicate_object then null;
end;
$$;
