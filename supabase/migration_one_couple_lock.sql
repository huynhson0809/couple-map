-- Permanent one-couple-per-account lock.
-- Run after migration_security_hardening.sql.

alter table public.users
  add column if not exists first_couple_id uuid,
  add column if not exists couple_locked_at timestamptz;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'users'
      and c.contype = 'f'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.users'::regclass
            and a.attname = 'first_couple_id'
        )
      ]::smallint[]
  loop
    execute format('alter table public.users drop constraint %I', constraint_name);
  end loop;
end;
$$;

update public.users
set
  first_couple_id = couple_id,
  couple_locked_at = coalesce(couple_locked_at, now())
where couple_id is not null
  and first_couple_id is null;

create or replace function public.pinly_membership_mutation_allowed()
returns boolean
language sql
stable
as $$
  select current_user not in ('anon', 'authenticated', 'authenticator')
$$;

create or replace function public.protect_user_identity_fields()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id
    or old.email is distinct from new.email
    or old.couple_id is distinct from new.couple_id
    or old.first_couple_id is distinct from new.first_couple_id
    or old.couple_locked_at is distinct from new.couple_locked_at
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

create or replace function public.create_couple_for_current_user()
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_couple_id uuid;
  locked_couple_id uuid;
  c public.couples;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id, first_couple_id
    into existing_couple_id, locked_couple_id
  from public.users
  where id = uid
  for update;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0004';
  end if;

  if locked_couple_id is not null then
    select * into c
    from public.couples
    where id = locked_couple_id;

    if c.id is not null then
      update public.users
      set couple_id = c.id
      where id = uid;

      return c;
    end if;

    raise exception 'ONE_COUPLE_ACCOUNT_LOCKED' using errcode = 'P0003';
  end if;

  if existing_couple_id is not null then
    select * into c
    from public.couples
    where id = existing_couple_id;

    if c.id is not null then
      update public.users
      set
        first_couple_id = c.id,
        couple_locked_at = coalesce(couple_locked_at, now())
      where id = uid;

      return c;
    end if;
  end if;

  insert into public.couples (user_a)
  values (uid)
  returning * into c;

  update public.users
  set
    couple_id = c.id,
    first_couple_id = c.id,
    couple_locked_at = coalesce(couple_locked_at, now())
  where id = uid;

  return c;
end;
$$;

revoke all on function public.create_couple_for_current_user() from public, anon;
grant execute on function public.create_couple_for_current_user() to authenticated;

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
  locked_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id, first_couple_id
    into existing_couple_id, locked_couple_id
  from public.users
  where id = uid
  for update;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0004';
  end if;

  select * into c
  from public.couples
  where invite_code = norm
  for update;

  if c.id is null then
    raise exception 'Invite code not found' using errcode = 'P0001';
  end if;

  if locked_couple_id is not null and locked_couple_id <> c.id then
    raise exception 'ONE_COUPLE_ACCOUNT_LOCKED' using errcode = 'P0003';
  end if;

  if locked_couple_id is null
    and existing_couple_id is not null
    and existing_couple_id <> c.id
  then
    raise exception 'ONE_COUPLE_ACCOUNT_LOCKED' using errcode = 'P0003';
  end if;

  if c.user_a = uid or c.user_b = uid then
    update public.users
    set
      couple_id = c.id,
      first_couple_id = coalesce(first_couple_id, c.id),
      couple_locked_at = coalesce(couple_locked_at, now())
    where id = uid;

    return c;
  end if;

  if c.user_b is not null then
    raise exception 'This couple is already full' using errcode = 'P0002';
  end if;

  update public.couples
  set user_b = uid
  where id = c.id
  returning * into c;

  update public.users
  set
    couple_id = c.id,
    first_couple_id = coalesce(first_couple_id, c.id),
    couple_locked_at = coalesce(couple_locked_at, now())
  where id = uid;

  return c;
end;
$$;

revoke all on function public.join_couple_by_invite(text) from public, anon;
grant execute on function public.join_couple_by_invite(text) to authenticated;
