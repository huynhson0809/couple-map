-- Security hardening for Pinly.
-- Run this after the base schema and feature migrations.

-- 1) Dedupe push notifications so direct Edge Function replays cannot spam devices.
create table if not exists public.notification_delivery_events (
  event_key text primary key,
  event_type text not null,
  actor_id uuid references public.users(id) on delete set null,
  recipient_id uuid references public.users(id) on delete set null,
  pin_id uuid references public.pins(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_delivery_events_created_at
  on public.notification_delivery_events(created_at desc);

alter table public.notification_delivery_events enable row level security;

-- No client policies on purpose. Edge Functions use service_role for this table.

create table if not exists public.edge_rate_limits (
  limit_key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (limit_key, window_start)
);

alter table public.edge_rate_limits enable row level security;

create or replace function public.check_edge_rate_limit(
  limit_key text,
  window_seconds integer,
  max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket_start timestamptz;
  current_count integer;
begin
  if limit_key is null or length(trim(limit_key)) = 0 then
    return false;
  end if;
  if window_seconds <= 0 or max_requests <= 0 then
    return false;
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / window_seconds) * window_seconds
  );

  delete from public.edge_rate_limits
  where window_start < now() - make_interval(secs => window_seconds * 4);

  insert into public.edge_rate_limits (limit_key, window_start, count)
  values (limit_key, bucket_start, 1)
  on conflict (limit_key, window_start)
  do update set
    count = public.edge_rate_limits.count + 1,
    updated_at = now()
  returning count into current_count;

  return current_count <= max_requests;
end;
$$;

revoke all on function public.check_edge_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_edge_rate_limit(text, integer, integer)
  to service_role;

-- 2) Prevent client-side tampering with membership and ownership columns.
create or replace function public.pinly_membership_mutation_allowed()
returns boolean
language sql
volatile
as $$
  select current_setting('pinly.allow_membership_mutation', true) = 'on'
$$;

create or replace function public.protect_user_identity_fields()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id
    or old.email is distinct from new.email
    or old.couple_id is distinct from new.couple_id
    or old.created_at is distinct from new.created_at
  then
    if not public.pinly_membership_mutation_allowed() then
      raise exception 'Protected user field cannot be changed directly';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_identity_fields on public.users;
create trigger protect_user_identity_fields
  before update on public.users
  for each row execute function public.protect_user_identity_fields();

create or replace function public.protect_couple_membership_fields()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id
    or old.invite_code is distinct from new.invite_code
    or old.user_a is distinct from new.user_a
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Protected couple field cannot be changed';
  end if;

  if old.user_b is distinct from new.user_b
    and not public.pinly_membership_mutation_allowed()
  then
    raise exception 'Couple membership cannot be changed directly';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_couple_membership_fields on public.couples;
create trigger protect_couple_membership_fields
  before update on public.couples
  for each row execute function public.protect_couple_membership_fields();

create or replace function public.protect_pin_ownership_fields()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id
    or old.couple_id is distinct from new.couple_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Protected pin field cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_pin_ownership_fields on public.pins;
create trigger protect_pin_ownership_fields
  before update on public.pins
  for each row execute function public.protect_pin_ownership_fields();

-- 3) Tighten RLS checks for updates that previously relied mostly on USING.
drop policy if exists "Any authenticated user can create couple" on public.couples;

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Couple members can update their couple" on public.couples;
create policy "Couple members can update their couple"
  on public.couples for update
  using (id = get_my_couple_id() or user_a = auth.uid() or user_b = auth.uid())
  with check (id = get_my_couple_id() or user_a = auth.uid() or user_b = auth.uid());

drop policy if exists "Couple members can update their pins" on public.pins;
create policy "Couple members can update their pins"
  on public.pins for update
  using (couple_id = get_my_couple_id())
  with check (couple_id = get_my_couple_id());

drop policy if exists "Users can update their pin comments" on public.pin_comments;
create policy "Users can update their pin comments"
  on public.pin_comments for update
  using (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  )
  with check (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

alter table public.pins
  drop constraint if exists pins_title_length_check,
  drop constraint if exists pins_note_length_check,
  drop constraint if exists pins_lat_lng_check;
alter table public.pins
  add constraint pins_title_length_check check (char_length(title) between 1 and 160),
  add constraint pins_note_length_check check (note is null or char_length(note) <= 3000),
  add constraint pins_lat_lng_check check (lat between -90 and 90 and lng between -180 and 180);

alter table public.pin_comments
  drop constraint if exists pin_comments_body_length_check;
alter table public.pin_comments
  add constraint pin_comments_body_length_check
  check (char_length(trim(body)) between 1 and 500);

alter table public.bucket_list
  drop constraint if exists bucket_list_title_length_check;
alter table public.bucket_list
  add constraint bucket_list_title_length_check
  check (char_length(trim(title)) between 1 and 200);

create or replace function public.enforce_pinly_write_rate_limits()
returns trigger
language plpgsql
as $$
declare
  writes_in_window integer;
begin
  if tg_table_name = 'pins' then
    select count(*) into writes_in_window
    from public.pins
    where created_by = new.created_by
      and created_at > now() - interval '1 minute';

    if writes_in_window >= 12 then
      raise exception 'Too many memories created. Please wait a moment.';
    end if;
  elsif tg_table_name = 'pin_comments' then
    select count(*) into writes_in_window
    from public.pin_comments
    where user_id = new.user_id
      and created_at > now() - interval '1 minute';

    if writes_in_window >= 30 then
      raise exception 'Too many comments. Please wait a moment.';
    end if;
  elsif tg_table_name = 'bucket_list' then
    select count(*) into writes_in_window
    from public.bucket_list
    where created_by = new.created_by
      and created_at > now() - interval '1 minute';

    if writes_in_window >= 20 then
      raise exception 'Too many wishlist items. Please wait a moment.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_pin_write_rate_limit on public.pins;
create trigger enforce_pin_write_rate_limit
  before insert on public.pins
  for each row execute function public.enforce_pinly_write_rate_limits();

drop trigger if exists enforce_comment_write_rate_limit on public.pin_comments;
create trigger enforce_comment_write_rate_limit
  before insert on public.pin_comments
  for each row execute function public.enforce_pinly_write_rate_limits();

drop trigger if exists enforce_bucket_write_rate_limit on public.bucket_list;
create trigger enforce_bucket_write_rate_limit
  before insert on public.bucket_list
  for each row execute function public.enforce_pinly_write_rate_limits();

-- 4) Safe RPC for creating a couple; clients should not write users.couple_id directly.
create or replace function public.create_couple_for_current_user()
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_couple_id uuid;
  c public.couples;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id into existing_couple_id
  from public.users
  where id = uid;

  if existing_couple_id is not null then
    select * into c from public.couples where id = existing_couple_id;
    if c.id is not null then
      return c;
    end if;
  end if;

  insert into public.couples (user_a)
  values (uid)
  returning * into c;

  perform set_config('pinly.allow_membership_mutation', 'on', true);
  update public.users
    set couple_id = c.id
    where id = uid;

  return c;
end;
$$;

grant execute on function public.create_couple_for_current_user() to authenticated;

-- 5) Harden invite join: lock the target couple and prevent joining multiple couples.
create or replace function public.join_couple_by_invite(code text)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.couples;
  norm text := upper(trim(code));
  uid uuid := auth.uid();
  existing_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id into existing_couple_id
  from public.users
  where id = uid;

  select * into c
  from public.couples
  where invite_code = norm
  for update;

  if c.id is null then
    raise exception 'Invite code not found' using errcode = 'P0001';
  end if;

  if existing_couple_id is not null and existing_couple_id <> c.id then
    raise exception 'You are already in another couple' using errcode = 'P0003';
  end if;

  if c.user_a = uid or c.user_b = uid then
    perform set_config('pinly.allow_membership_mutation', 'on', true);
    update public.users set couple_id = c.id where id = uid;
    return c;
  end if;

  if c.user_b is not null then
    raise exception 'This couple is already full' using errcode = 'P0002';
  end if;

  perform set_config('pinly.allow_membership_mutation', 'on', true);
  update public.couples set user_b = uid where id = c.id returning * into c;
  update public.users set couple_id = c.id where id = uid;
  return c;
end;
$$;

grant execute on function public.join_couple_by_invite(text) to authenticated;
