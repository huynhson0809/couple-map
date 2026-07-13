-- In-app customer support tickets for Pinly.
-- Run once in the Supabase SQL Editor before deploying the frontend.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('question', 'bug')),
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 20 and 4000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 4000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_support_tickets_user_created
  on public.support_tickets(user_id, created_at desc);

create index if not exists idx_support_tickets_admin_queue
  on public.support_tickets(status, created_at asc);

alter table public.support_tickets enable row level security;

drop policy if exists "Users can read own support tickets"
  on public.support_tickets;
drop policy if exists "Users can submit own support tickets"
  on public.support_tickets;

create policy "Users can read own support tickets"
  on public.support_tickets for select
  using (user_id = auth.uid());

create policy "Users can submit own support tickets"
  on public.support_tickets for insert
  with check (
    user_id = auth.uid()
    and status = 'open'
    and admin_reply is null
    and resolved_at is null
  );

-- Submitted tickets are immutable from the client. Admin tools and service-role
-- jobs can still change status and add a reply because they bypass RLS.

create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_support_ticket_updated_at
  on public.support_tickets;
create trigger set_support_ticket_updated_at
  before update on public.support_tickets
  for each row execute function public.set_support_ticket_updated_at();

create or replace function public.enforce_support_ticket_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_count integer;
begin
  if v_user_id is null or new.user_id is distinct from v_user_id then
    raise exception using
      errcode = '42501',
      message = 'support_ticket_user_mismatch';
  end if;

  if exists (
    select 1
    from public.support_tickets st
    where st.user_id = v_user_id
      and st.created_at > now() - interval '60 seconds'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'support_rate_limit';
  end if;

  select count(*)::integer
    into v_recent_count
  from public.support_tickets st
  where st.user_id = v_user_id
    and st.created_at > now() - interval '24 hours';

  if v_recent_count >= 10 then
    raise exception using
      errcode = 'P0001',
      message = 'support_daily_limit';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_support_ticket_rate_limit()
  from public, anon, authenticated;

drop trigger if exists enforce_support_ticket_rate_limit
  on public.support_tickets;
create trigger enforce_support_ticket_rate_limit
  before insert on public.support_tickets
  for each row execute function public.enforce_support_ticket_rate_limit();

grant select, insert on public.support_tickets to authenticated;

