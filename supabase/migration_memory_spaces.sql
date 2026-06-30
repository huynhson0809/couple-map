-- Memory spaces compatibility layer.
-- Adds spaces alongside legacy couples without removing existing couple_id data.

alter table public.couples
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'plus', 'pro'));

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'personal' check (type in ('personal', 'shared', 'group')),
  invite_code text unique,
  owner_id uuid not null references public.users(id) on delete cascade,
  max_members integer not null default 5 check (max_members between 1 and 5),
  background_image_url text,
  started_on date,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  legacy_couple_id uuid unique references public.couples(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spaces
  alter column invite_code drop default;

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

alter table public.users
  add column if not exists active_space_id uuid;

do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att
      on att.attrelid = rel.oid
      and att.attnum = any(con.conkey)
    where nsp.nspname = 'public'
      and rel.relname = 'users'
      and con.contype = 'f'
      and att.attname = 'active_space_id'
  loop
    execute format('alter table public.users drop constraint if exists %I', fk.conname);
  end loop;
end;
$$;

alter table public.users
  add constraint users_active_space_id_fkey
  foreign key (active_space_id) references public.spaces(id) on delete set null;

alter table public.pins
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.pin_categories
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.collections
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.bucket_list
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.custom_categories
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.notifications
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.subscriptions
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.couple_streaks
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

alter table public.couple_streak_days
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

create index if not exists idx_spaces_owner_id
  on public.spaces(owner_id);
create index if not exists idx_spaces_type
  on public.spaces(type);
create index if not exists idx_spaces_legacy_couple_id
  on public.spaces(legacy_couple_id);
create index if not exists idx_space_members_user_status
  on public.space_members(user_id, status);
create index if not exists idx_space_members_space_status
  on public.space_members(space_id, status);
create index if not exists idx_users_active_space_id
  on public.users(active_space_id);
create index if not exists idx_pins_space_id
  on public.pins(space_id);
create index if not exists idx_pin_categories_space_category_pin
  on public.pin_categories(space_id, category_id, pin_id);
create index if not exists idx_collections_space_id
  on public.collections(space_id);
create index if not exists idx_bucket_list_space_status_created
  on public.bucket_list(space_id, status, created_at desc);
create index if not exists idx_custom_categories_space_id
  on public.custom_categories(space_id);
create index if not exists idx_notifications_space_id
  on public.notifications(space_id);
create index if not exists idx_subscriptions_space_id
  on public.subscriptions(space_id);
create index if not exists idx_couple_streaks_space_id
  on public.couple_streaks(space_id);
create index if not exists idx_couple_streak_days_space_id
  on public.couple_streak_days(space_id, streak_date desc);

insert into public.spaces (
  id,
  name,
  type,
  invite_code,
  owner_id,
  max_members,
  background_image_url,
  started_on,
  plan,
  legacy_couple_id,
  created_at,
  updated_at
)
select
  c.id,
  'Our Space',
  'shared',
  c.invite_code,
  coalesce(c.user_a, c.user_b),
  5,
  c.background_image_url,
  c.anniversary_date,
  coalesce(c.plan, 'free'),
  c.id,
  coalesce(c.created_at, now()),
  coalesce(c.created_at, now())
from public.couples c
where coalesce(c.user_a, c.user_b) is not null
on conflict (id) do nothing;

insert into public.space_members (space_id, user_id, role, status, joined_at)
select c.id, c.user_a, 'owner', 'active', coalesce(c.created_at, now())
from public.couples c
join public.spaces s on s.id = c.id
where c.user_a is not null
union all
select c.id, c.user_b, case when c.user_a is null then 'owner' else 'member' end, 'active', coalesce(c.created_at, now())
from public.couples c
join public.spaces s on s.id = c.id
where c.user_b is not null
on conflict (space_id, user_id) do nothing;

update public.users u
set active_space_id = u.couple_id
where u.active_space_id is null
  and u.couple_id is not null
  and exists (
    select 1 from public.spaces s where s.id = u.couple_id
  );

update public.pins
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.pin_categories
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.collections
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.bucket_list
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.custom_categories
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.notifications
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.spaces s
set invite_code = null
where s.type = 'personal'
  and s.invite_code is not null
  and not exists (
    select 1
    from public.space_members sm
    where sm.space_id = s.id
      and sm.status = 'active'
      and sm.user_id <> s.owner_id
  );

create or replace function public.assign_notification_space_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.space_id is null and new.couple_id is not null then
    select s.id
      into new.space_id
    from public.spaces s
    where s.id = new.couple_id
       or s.legacy_couple_id = new.couple_id
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_notification_space_id on public.notifications;
create trigger assign_notification_space_id
  before insert or update of couple_id, space_id on public.notifications
  for each row execute function public.assign_notification_space_id();

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
        n.space_id = ts.id
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
            n.space_id = ts.id
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

create or replace function public.get_space_stats_summary(target_space_id uuid)
returns table (
  total_pins bigint,
  city_list text[],
  country_list text[],
  first_pin_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::bigint
      from public.pins p
      where p.space_id = target_space_id
    ) as total_pins,
    coalesce(
      (
        select array_agg(city order by city)
        from (
          select distinct nullif(trim(p.city), '') as city
          from public.pins p
          where p.space_id = target_space_id
            and nullif(trim(p.city), '') is not null
        ) cities
      ),
      array[]::text[]
    ) as city_list,
    coalesce(
      (
        select array_agg(country order by country)
        from (
          select distinct nullif(trim(p.country), '') as country
          from public.pins p
          where p.space_id = target_space_id
            and nullif(trim(p.country), '') is not null
        ) countries
      ),
      array[]::text[]
    ) as country_list,
    (
      select min(p.created_at)
      from public.pins p
      where p.space_id = target_space_id
    ) as first_pin_at;
$$;

revoke all on function public.get_space_stats_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_space_stats_summary(uuid)
  to service_role;

update public.subscriptions
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.couple_streaks
set space_id = couple_id
where space_id is null
  and couple_id is not null;

update public.couple_streak_days
set space_id = couple_id
where space_id is null
  and couple_id is not null;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'spaces'
    ) then
      alter publication supabase_realtime add table public.spaces;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'space_members'
    ) then
      alter publication supabase_realtime add table public.space_members;
    end if;
  end if;
end;
$$;

create or replace function public.is_space_member(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members sm
    where sm.space_id = target_space_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  );
$$;

create or replace function public.is_space_owner(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members sm
    where sm.space_id = target_space_id
      and sm.user_id = auth.uid()
      and sm.role = 'owner'
      and sm.status = 'active'
  );
$$;

create or replace function public.get_my_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.space_id
  from public.space_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
  order by sm.joined_at;
$$;

create or replace function public.ensure_space_legacy_couple(space_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_target_space_id uuid := space_id;
  v_space public.spaces;
  v_couple_id uuid;
  v_invite_code text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_space
  from public.spaces
  where id = v_target_space_id
  for update;

  if v_space.id is null then
    raise exception 'Space not found' using errcode = 'P0001';
  end if;

  if not public.is_space_member(v_space.id) then
    raise exception 'Not a space member' using errcode = 'P0003';
  end if;

  if v_space.legacy_couple_id is not null then
    return v_space.legacy_couple_id;
  end if;

  select c.id into v_couple_id
  from public.couples c
  where c.id = v_space.id;

  v_invite_code := coalesce(
    v_space.invite_code,
    upper(substring(md5(random()::text), 1, 6))
  );

  while v_couple_id is null loop
    insert into public.couples (
      id,
      invite_code,
      user_a,
      anniversary_date,
      background_image_url,
      plan,
      created_at
    )
    values (
      v_space.id,
      v_invite_code,
      v_space.owner_id,
      v_space.started_on,
      v_space.background_image_url,
      v_space.plan,
      v_space.created_at
    )
    on conflict do nothing
    returning id into v_couple_id;

    if v_couple_id is null then
      select c.id into v_couple_id
      from public.couples c
      where c.id = v_space.id;
    end if;

    if v_couple_id is null then
      v_invite_code := upper(substring(md5(random()::text), 1, 6));
    end if;
  end loop;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.spaces
  set legacy_couple_id = v_space.id
  where id = v_space.id
  returning * into v_space;

  update public.users
  set couple_id = v_couple_id
  where id = v_space.owner_id;

  return v_couple_id;
end;
$$;

drop policy if exists "Members can read spaces"
  on public.spaces;
create policy "Members can read spaces"
  on public.spaces for select
  using (public.is_space_member(id));

drop policy if exists "Owners can update spaces"
  on public.spaces;
create policy "Owners can update spaces"
  on public.spaces for update
  using (public.is_space_owner(id))
  with check (public.is_space_owner(id));

drop policy if exists "Members can read space members"
  on public.space_members;
create policy "Members can read space members"
  on public.space_members for select
  using (public.is_space_member(space_id));

create or replace function public.protect_space_control_fields()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id
    or old.owner_id is distinct from new.owner_id
    or old.max_members is distinct from new.max_members
    or old.plan is distinct from new.plan
    or old.legacy_couple_id is distinct from new.legacy_couple_id
    or old.created_at is distinct from new.created_at
  then
    if not public.pinly_membership_mutation_allowed() then
      raise exception 'Protected space field cannot be changed directly';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_space_control_fields on public.spaces;
create trigger protect_space_control_fields
  before update on public.spaces
  for each row execute function public.protect_space_control_fields();

drop trigger if exists spaces_updated_at on public.spaces;
create trigger spaces_updated_at
  before update on public.spaces
  for each row execute function update_updated_at();

create or replace function public.get_space_context_for_current_user(active_space_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_requested_space_id uuid := active_space_id;
  v_active_space public.spaces;
  profile_json jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select to_jsonb(u) into profile_json
  from public.users u
  where u.id = uid;

  if profile_json is null then
    return jsonb_build_object(
      'profile', null,
      'spaces', '[]'::jsonb,
      'activeSpace', null,
      'members', '[]'::jsonb
    );
  end if;

  if v_requested_space_id is not null then
    select s.* into v_active_space
    from public.spaces s
    join public.space_members sm on sm.space_id = s.id
    where s.id = v_requested_space_id
      and sm.user_id = uid
      and sm.status = 'active'
    limit 1;
  end if;

  if v_active_space.id is null then
    select s.* into v_active_space
    from public.users u
    join public.spaces s on s.id = u.active_space_id
    join public.space_members sm on sm.space_id = s.id
    where u.id = uid
      and sm.user_id = uid
      and sm.status = 'active'
    limit 1;
  end if;

  if v_active_space.id is null then
    select s.* into v_active_space
    from public.spaces s
    join public.space_members sm on sm.space_id = s.id
    where sm.user_id = uid
      and sm.status = 'active'
    order by sm.joined_at
    limit 1;
  end if;

  return jsonb_build_object(
    'profile',
    profile_json,
    'spaces',
    coalesce(
      (
        select jsonb_agg(to_jsonb(s) order by sm.joined_at)
        from public.space_members sm
        join public.spaces s on s.id = sm.space_id
        where sm.user_id = uid
          and sm.status = 'active'
      ),
      '[]'::jsonb
    ),
    'activeSpace',
    case when v_active_space.id is null then null else to_jsonb(v_active_space) end,
    'members',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'space_id', sm.space_id,
            'user_id', sm.user_id,
            'role', sm.role,
            'status', sm.status,
            'joined_at', sm.joined_at,
            'user', to_jsonb(u)
          )
          order by sm.joined_at
        )
        from public.space_members sm
        join public.users u on u.id = sm.user_id
        where sm.status = 'active'
          and exists (
            select 1
            from public.space_members owner_sm
            where owner_sm.space_id = sm.space_id
              and owner_sm.user_id = uid
              and owner_sm.status = 'active'
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.create_personal_space_for_current_user()
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_space public.spaces;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.users where id = uid) then
    raise exception 'User profile not found' using errcode = 'P0004';
  end if;

  insert into public.spaces (name, type, owner_id, max_members)
  values ('Personal Space', 'personal', uid, 1)
  returning * into v_space;

  insert into public.space_members (space_id, user_id, role, status)
  values (v_space.id, uid, 'owner', 'active');

  perform public.ensure_space_legacy_couple(v_space.id);

  update public.users
  set active_space_id = v_space.id
  where id = uid;

  return v_space;
end;
$$;

create or replace function public.create_shared_space_for_current_user(name text default null)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_name text := nullif(trim(name), '');
  v_space public.spaces;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.users where id = uid) then
    raise exception 'User profile not found' using errcode = 'P0004';
  end if;

  insert into public.spaces (name, type, owner_id)
  values (coalesce(v_name, 'Shared Space'), 'shared', uid)
  returning * into v_space;

  insert into public.space_members (space_id, user_id, role, status)
  values (v_space.id, uid, 'owner', 'active');

  perform public.ensure_space_legacy_couple(v_space.id);

  update public.users
  set active_space_id = v_space.id
  where id = uid;

  return v_space;
end;
$$;

create or replace function public.promote_personal_space_to_shared(space_id uuid)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_target_space_id uuid := space_id;
  v_space public.spaces;
  v_legacy_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_space
  from public.spaces s
  where s.id = v_target_space_id
  for update;

  if v_space.id is null then
    raise exception 'Space not found' using errcode = 'P0001';
  end if;

  if not public.is_space_owner(v_space.id) then
    raise exception 'Only space owners can promote spaces' using errcode = 'P0003';
  end if;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.spaces
  set
    type = 'shared',
    max_members = greatest(max_members, 5)
  where id = v_space.id
  returning * into v_space;

  v_legacy_couple_id := public.ensure_space_legacy_couple(v_space.id);
  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.users
  set
    active_space_id = v_space.id,
    couple_id = coalesce(v_legacy_couple_id, couple_id)
  where id = uid;

  return v_space;
end;
$$;

create or replace function public.create_or_get_space_invite(space_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_space_id uuid := space_id;
  v_code text;
  v_candidate_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_space_owner(v_target_space_id) then
    raise exception 'Only space owners can manage invites' using errcode = 'P0003';
  end if;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.spaces
  set
    type = case when type = 'personal' then 'shared' else type end,
    max_members = greatest(max_members, 5)
  where id = v_target_space_id;

  select invite_code into v_code
  from public.spaces
  where id = v_target_space_id;

  if v_code is null then
    loop
      v_candidate_code := upper(substring(md5(random()::text), 1, 6));

      update public.spaces
      set invite_code = v_candidate_code
      where id = v_target_space_id
        and not exists (
          select 1 from public.spaces s where s.invite_code = v_candidate_code
        )
      returning invite_code into v_code;

      exit when v_code is not null;
    end loop;
  end if;

  perform public.ensure_space_legacy_couple(v_target_space_id);

  return v_code;
end;
$$;

create or replace function public.join_space_by_invite(code text)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  norm text := upper(trim(code));
  uid uuid := auth.uid();
  active_count integer;
  v_legacy_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if norm is null or norm = '' then
    raise exception 'Invite code not found' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.users where id = uid) then
    raise exception 'User profile not found' using errcode = 'P0004';
  end if;

  select * into v_space
  from public.spaces
  where invite_code = norm
  for update;

  if v_space.id is null then
    raise exception 'Invite code not found' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.space_members sm
    where sm.space_id = v_space.id
      and sm.user_id = uid
      and sm.status = 'active'
  ) then
    v_legacy_couple_id := public.ensure_space_legacy_couple(v_space.id);
    perform set_config('pinly.allow_membership_mutation', 'on', true);

    update public.users
    set
      active_space_id = v_space.id,
      couple_id = coalesce(v_legacy_couple_id, couple_id)
    where id = uid;

    return v_space;
  end if;

  select count(*) into active_count
  from public.space_members
  where space_id = v_space.id and status = 'active';

  if not (active_count < v_space.max_members) then
    raise exception 'Space is full' using errcode = 'P0002';
  end if;

  insert into public.space_members (space_id, user_id, role, status, joined_at)
  values (v_space.id, uid, 'member', 'active', now())
  on conflict (space_id, user_id) do update
  set
    status = 'active',
    role = case
      when public.space_members.role = 'owner' then 'owner'
      else 'member'
    end,
    joined_at = now();

  v_legacy_couple_id := public.ensure_space_legacy_couple(v_space.id);

  if v_legacy_couple_id is not null then
    perform set_config('pinly.allow_membership_mutation', 'on', true);

    update public.couples
    set user_b = uid
    where id = v_legacy_couple_id
      and user_a is distinct from uid
      and user_b is null;
  end if;

  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.users
  set
    active_space_id = v_space.id,
    couple_id = coalesce(v_legacy_couple_id, couple_id)
  where id = uid;

  return v_space;
end;
$$;

create or replace function public.set_active_space_for_current_user(space_id uuid)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_target_space_id uuid := space_id;
  v_space public.spaces;
  v_legacy_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select s.* into v_space
  from public.spaces s
  join public.space_members sm on sm.space_id = s.id
  where s.id = v_target_space_id
    and sm.user_id = uid
    and sm.status = 'active'
  limit 1;

  if v_space.id is null then
    raise exception 'Space not found' using errcode = 'P0001';
  end if;

  v_legacy_couple_id := public.ensure_space_legacy_couple(v_space.id);
  perform set_config('pinly.allow_membership_mutation', 'on', true);

  update public.users
  set
    active_space_id = v_space.id,
    couple_id = coalesce(v_legacy_couple_id, couple_id)
  where id = uid;

  return v_space;
end;
$$;

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
  v_space_id uuid;
  v_owner_id uuid;
  v_member_ids uuid[];
  v_legacy_member_ids uuid[];
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

  select s.id, s.owner_id
    into v_space_id, v_owner_id
  from public.spaces s
  where s.id = p_couple_id
     or s.legacy_couple_id = p_couple_id
  for update;

  v_legacy_member_ids := array_remove(array[v_couple.user_a, v_couple.user_b], null);

  if v_space_id is not null then
    if p_initiator_user_id is distinct from v_owner_id then
      raise exception 'Only space owners can delete spaces' using errcode = 'P0002';
    end if;

    select coalesce(array_agg(sm.user_id order by sm.joined_at), '{}'::uuid[])
      into v_member_ids
    from public.space_members sm
    where sm.space_id = v_space_id
      and sm.status = 'active';

    if not p_initiator_user_id = any(coalesce(v_member_ids, '{}'::uuid[])) then
      raise exception 'Not a space member' using errcode = 'P0002';
    end if;
  else
    if p_initiator_user_id is distinct from v_couple.user_a
      and p_initiator_user_id is distinct from v_couple.user_b
    then
      raise exception 'Not a couple member' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(array_agg(distinct members.member_id), '{}'::uuid[])
    into v_member_ids
  from unnest(
    coalesce(v_member_ids, '{}'::uuid[])
    || coalesce(v_legacy_member_ids, '{}'::uuid[])
  ) as members(member_id)
  where members.member_id is not null;

  perform 1
  from public.users
  where id = any(v_member_ids)
     or (v_space_id is not null and active_space_id = v_space_id)
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
          'Không gian kỷ niệm đã được kết thúc. Bạn có thể tạo hoặc tham gia một bản đồ mới.'
        else
          'Không gian kỷ niệm này đã được kết thúc. Các kỷ niệm trong bản đồ đã được xoá.'
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
    couple_id = case
      when couple_id = p_couple_id then null
      else couple_id
    end,
    first_couple_id = case
      when first_couple_id = p_couple_id then null
      else first_couple_id
    end,
    couple_locked_at = case
      when couple_id = p_couple_id or first_couple_id = p_couple_id then null
      else couple_locked_at
    end,
    active_space_id = case
      when v_space_id is not null and active_space_id = v_space_id then null
      else active_space_id
    end
  where id = any(v_member_ids)
     or couple_id = p_couple_id
     or first_couple_id = p_couple_id
     or (v_space_id is not null and active_space_id = v_space_id);

  if v_space_id is not null then
    delete from public.spaces
    where id = v_space_id;
  end if;

  delete from public.couples
  where id = p_couple_id;

  return jsonb_build_object(
    'ok', true,
    'coupleId', p_couple_id,
    'spaceId', v_space_id,
    'memberIds', to_jsonb(v_member_ids)
  );
end;
$$;

revoke all on function public.is_space_member(uuid)
  from public, anon;
grant execute on function public.is_space_member(uuid)
  to authenticated;

revoke all on function public.is_space_owner(uuid)
  from public, anon;
grant execute on function public.is_space_owner(uuid)
  to authenticated;

revoke all on function public.get_my_space_ids()
  from public, anon;
grant execute on function public.get_my_space_ids()
  to authenticated;

revoke all on function public.ensure_space_legacy_couple(uuid)
  from public, anon, authenticated;

revoke all on function public.get_space_context_for_current_user(uuid)
  from public, anon;
grant execute on function public.get_space_context_for_current_user(uuid)
  to authenticated;

revoke all on function public.create_personal_space_for_current_user()
  from public, anon;
grant execute on function public.create_personal_space_for_current_user()
  to authenticated;

revoke all on function public.create_shared_space_for_current_user(text)
  from public, anon;
grant execute on function public.create_shared_space_for_current_user(text)
  to authenticated;

revoke all on function public.promote_personal_space_to_shared(uuid)
  from public, anon;
grant execute on function public.promote_personal_space_to_shared(uuid)
  to authenticated;

revoke all on function public.create_or_get_space_invite(uuid)
  from public, anon;
grant execute on function public.create_or_get_space_invite(uuid)
  to authenticated;

revoke all on function public.join_space_by_invite(text)
  from public, anon;
grant execute on function public.join_space_by_invite(text)
  to authenticated;

revoke all on function public.set_active_space_for_current_user(uuid)
  from public, anon;
grant execute on function public.set_active_space_for_current_user(uuid)
  to authenticated;

revoke all on function public.delete_space_for_current_user(uuid)
  from public, anon;
grant execute on function public.delete_space_for_current_user(uuid)
  to authenticated;

revoke all on function public.finalize_couple_breakup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_couple_breakup(uuid, uuid)
  to service_role;
