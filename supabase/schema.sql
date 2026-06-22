-- Mapmate — full schema. Run in Supabase SQL Editor.

-- ============================================
-- 1. TABLES
-- ============================================

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default upper(substring(md5(random()::text), 1, 6)),
  user_a uuid,
  user_b uuid,
  anniversary_date date,
  background_image_url text,
  created_at timestamptz default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  couple_id uuid references public.couples(id),
  created_at timestamptz default now()
);

alter table public.couples
  add constraint fk_user_a foreign key (user_a) references public.users(id),
  add constraint fk_user_b foreign key (user_b) references public.users(id);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  created_by uuid references public.users(id) not null,
  title text not null,
  note text,
  lat double precision not null,
  lng double precision not null,
  address text,
  city text,
  country text,
  category text,
  marker_emoji text,
  marker_image_url text,
  is_favorite boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.pin_categories (
  pin_id uuid not null references public.pins(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  category_id text not null,
  position int not null,
  created_at timestamptz default now(),
  primary key (pin_id, category_id),
  unique (pin_id, position),
  check (position >= 0 and position < 3)
);

create table public.pin_images (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid references public.pins(id) on delete cascade not null,
  cloudinary_url text not null,
  cloudinary_public_id text,
  width int,
  height int,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  title text not null,
  description text,
  cover_image_url text,
  date_from date,
  date_to date,
  created_at timestamptz default now()
);

create table public.pin_collections (
  pin_id uuid references public.pins(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  primary key (pin_id, collection_id)
);

create table public.bucket_list (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  created_by uuid references public.users(id) not null,
  title text not null,
  lat double precision not null,
  lng double precision not null,
  status text default 'dream' check (status in ('dream', 'done')),
  completed_pin_id uuid references public.pins(id),
  created_at timestamptz default now()
);

-- ============================================
-- 2. INDEXES
-- ============================================

create index idx_pins_couple_id on public.pins(couple_id);
create index idx_pins_created_at on public.pins(created_at desc);
create index idx_pins_couple_favorite_created_at on public.pins(couple_id, is_favorite, created_at desc);
create index idx_pins_location on public.pins(lat, lng);
create index idx_pin_categories_couple_category_pin on public.pin_categories(couple_id, category_id, pin_id);
create index idx_pin_categories_pin_position on public.pin_categories(pin_id, position);
create index idx_pin_images_pin_id on public.pin_images(pin_id);
create index idx_users_couple_id on public.users(couple_id);
create index idx_collections_couple_id on public.collections(couple_id);
create index idx_bucket_list_couple_id on public.bucket_list(couple_id);

-- ============================================
-- 3. RLS
-- ============================================

alter table public.users enable row level security;
alter table public.couples enable row level security;
alter table public.pins enable row level security;
alter table public.pin_categories enable row level security;
alter table public.pin_images enable row level security;
alter table public.collections enable row level security;
alter table public.pin_collections enable row level security;
alter table public.bucket_list enable row level security;

create or replace function get_my_couple_id()
returns uuid as $$
  select couple_id from public.users where id = auth.uid()
$$ language sql security definer stable;

create policy "Users can read own profile" on public.users for select using (id = auth.uid());
create policy "Users can read partner profile" on public.users for select using (couple_id = get_my_couple_id() and get_my_couple_id() is not null);
create policy "Users can update own profile" on public.users for update using (id = auth.uid());
create policy "Users can insert own profile" on public.users for insert with check (id = auth.uid());

create policy "Couple members can read their couple" on public.couples for select using (id = get_my_couple_id() or user_a = auth.uid() or user_b = auth.uid());
create policy "Any authenticated user can create couple" on public.couples for insert with check (auth.uid() is not null);
create policy "Couple members can update their couple" on public.couples for update using (id = get_my_couple_id() or user_a = auth.uid() or user_b = auth.uid());

create policy "Couple members can read their pins" on public.pins for select using (couple_id = get_my_couple_id());
create policy "Couple members can create pins" on public.pins for insert with check (couple_id = get_my_couple_id() and created_by = auth.uid());
create policy "Couple members can update their pins" on public.pins for update using (couple_id = get_my_couple_id());
create policy "Couple members can delete their pins" on public.pins for delete using (couple_id = get_my_couple_id());

create policy "Couple members can read pin categories"
  on public.pin_categories for select
  using (couple_id = get_my_couple_id());

create policy "Couple members can insert pin categories"
  on public.pin_categories for insert
  with check (
    couple_id = get_my_couple_id()
    and exists (
      select 1
      from public.pins p
      where p.id = pin_id
        and p.couple_id = pin_categories.couple_id
    )
  );

create policy "Couple members can update pin categories"
  on public.pin_categories for update
  using (couple_id = get_my_couple_id())
  with check (
    couple_id = get_my_couple_id()
    and exists (
      select 1
      from public.pins p
      where p.id = pin_id
        and p.couple_id = pin_categories.couple_id
    )
  );

create policy "Couple members can delete pin categories"
  on public.pin_categories for delete
  using (couple_id = get_my_couple_id());

create policy "Couple members can read pin images" on public.pin_images for select using (pin_id in (select id from public.pins where couple_id = get_my_couple_id()));
create policy "Couple members can insert pin images" on public.pin_images for insert with check (pin_id in (select id from public.pins where couple_id = get_my_couple_id()));
create policy "Couple members can delete pin images" on public.pin_images for delete using (pin_id in (select id from public.pins where couple_id = get_my_couple_id()));

create policy "Couple members can CRUD collections" on public.collections for all using (couple_id = get_my_couple_id());
create policy "Couple members can CRUD pin_collections" on public.pin_collections for all using (collection_id in (select id from public.collections where couple_id = get_my_couple_id()));
create policy "Couple members can CRUD bucket list" on public.bucket_list for all using (couple_id = get_my_couple_id());

-- ============================================
-- 4. REALTIME
-- ============================================

alter publication supabase_realtime add table public.pins;
alter publication supabase_realtime add table public.pin_categories;
alter publication supabase_realtime add table public.pin_images;

-- ============================================
-- 5. FUNCTIONS / TRIGGERS
-- ============================================

create or replace function public.normalized_pin_category_ids(in_category_ids text[])
returns table(category_id text, category_position int)
language sql immutable
as $$
  with input as (
    select trim(value) as category_id, ordinality
    from unnest(coalesce(in_category_ids, array[]::text[])) with ordinality as item(value, ordinality)
    where trim(value) <> ''
  ),
  deduped as (
    select category_id, min(ordinality) as first_order
    from input
    group by category_id
  ),
  limited as (
    select category_id, first_order
    from deduped
    order by first_order
    limit 3
  )
  select category_id, (row_number() over (order by first_order) - 1)::int as category_position
  from limited
  order by first_order
$$;

create or replace function public.set_pin_categories(in_pin_id uuid, in_category_ids text[])
returns table(pin_id uuid, couple_id uuid, category_id text, category_position int, created_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_couple_id uuid;
  primary_category_id text;
begin
  select p.couple_id
  into target_couple_id
  from public.pins p
  where p.id = in_pin_id;

  if target_couple_id is null then
    raise exception 'Pin not found' using errcode = 'P0001';
  end if;

  select n.category_id
  into primary_category_id
  from public.normalized_pin_category_ids(in_category_ids) n
  order by n.category_position
  limit 1;

  update public.pins p
  set category = primary_category_id
  where p.id = in_pin_id;

  delete from public.pin_categories pc
  where pc.pin_id = in_pin_id;

  insert into public.pin_categories (pin_id, couple_id, category_id, position)
  select in_pin_id, target_couple_id, n.category_id, n.category_position
  from public.normalized_pin_category_ids(in_category_ids) n;

  return query
  select pc.pin_id, pc.couple_id, pc.category_id, pc.position, pc.created_at
  from public.pin_categories pc
  where pc.pin_id = in_pin_id
  order by pc.position;
end;
$$;

create or replace function public.create_pin_with_categories(
  in_couple_id uuid,
  in_created_by uuid,
  in_title text,
  in_note text,
  in_category_ids text[],
  in_marker_emoji text,
  in_marker_image_url text,
  in_lat double precision,
  in_lng double precision,
  in_address text,
  in_city text,
  in_country text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  primary_category_id text;
begin
  select n.category_id
  into primary_category_id
  from public.normalized_pin_category_ids(in_category_ids) n
  order by n.category_position
  limit 1;

  insert into public.pins (
    couple_id,
    created_by,
    title,
    note,
    category,
    marker_emoji,
    marker_image_url,
    lat,
    lng,
    address,
    city,
    country
  )
  values (
    in_couple_id,
    in_created_by,
    in_title,
    in_note,
    primary_category_id,
    in_marker_emoji,
    in_marker_image_url,
    in_lat,
    in_lng,
    in_address,
    in_city,
    in_country
  )
  returning id into new_id;

  perform public.set_pin_categories(new_id, in_category_ids);
  return new_id;
end;
$$;

create or replace function public.update_pin_with_categories(
  in_pin_id uuid,
  in_title text,
  in_note text,
  in_category_ids text[],
  in_marker_emoji text,
  in_marker_image_url text,
  in_title_set boolean,
  in_note_set boolean,
  in_marker_emoji_set boolean,
  in_marker_image_url_set boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  primary_category_id text;
begin
  select n.category_id
  into primary_category_id
  from public.normalized_pin_category_ids(in_category_ids) n
  order by n.category_position
  limit 1;

  update public.pins p
  set
    title = case when in_title_set then in_title else p.title end,
    note = case when in_note_set then in_note else p.note end,
    category = primary_category_id,
    marker_emoji = case when in_marker_emoji_set then in_marker_emoji else p.marker_emoji end,
    marker_image_url = case when in_marker_image_url_set then in_marker_image_url else p.marker_image_url end
  where p.id = in_pin_id;

  if not found then
    raise exception 'Pin not found' using errcode = 'P0001';
  end if;

  perform public.set_pin_categories(in_pin_id, in_category_ids);
  return in_pin_id;
end;
$$;

create or replace function public.get_timeline_pin_page_ids(
  in_couple_id uuid,
  in_category_ids text[] default '{}',
  in_include_favorites boolean default false,
  in_date_from timestamptz default null,
  in_date_to timestamptz default null,
  in_creator_id uuid default null,
  in_address text default null,
  in_limit int default 24,
  in_offset int default 0
)
returns table(pin_id uuid, total_count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  with normalized_categories as (
    select category_id
    from public.normalized_pin_category_ids(in_category_ids)
  ),
  filtered as (
    select p.id as pin_id, p.created_at
    from public.pins p
    where p.couple_id = in_couple_id
      and (
        case
          when in_include_favorites and exists (select 1 from normalized_categories) then
            p.is_favorite
            or exists (
              select 1
              from public.pin_categories pc
              where pc.pin_id = p.id
                and pc.couple_id = p.couple_id
                and pc.category_id in (select category_id from normalized_categories)
            )
          when in_include_favorites then p.is_favorite
          when exists (select 1 from normalized_categories) then
            exists (
              select 1
              from public.pin_categories pc
              where pc.pin_id = p.id
                and pc.couple_id = p.couple_id
                and pc.category_id in (select category_id from normalized_categories)
            )
          else true
        end
      )
      and (in_date_from is null or p.created_at >= in_date_from)
      and (in_date_to is null or p.created_at <= in_date_to)
      and (in_creator_id is null or p.created_by = in_creator_id)
      and (
        nullif(trim(coalesce(in_address, '')), '') is null
        or p.address ilike '%' || trim(in_address) || '%'
        or p.city ilike '%' || trim(in_address) || '%'
        or p.country ilike '%' || trim(in_address) || '%'
      )
  ),
  counted as (
    select filtered.pin_id, filtered.created_at, count(*) over() as total_count
    from filtered
  )
  select counted.pin_id, counted.total_count
  from counted
  order by counted.created_at desc, counted.pin_id desc
  limit least(greatest(coalesce(in_limit, 24), 0), 100)
  offset greatest(coalesce(in_offset, 0), 0)
$$;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger pins_updated_at
  before update on public.pins
  for each row execute function update_updated_at();

-- ============================================
-- 6. JOIN COUPLE BY INVITE CODE (bypasses RLS)
-- ============================================

create or replace function join_couple_by_invite(code text)
returns public.couples
language plpgsql security definer
as $$
declare
  c public.couples;
  norm text := upper(trim(code));
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into c from public.couples where invite_code = norm;
  if c.id is null then
    raise exception 'Invite code not found' using errcode = 'P0001';
  end if;

  -- already a member: just ensure couple_id is set on the user row
  if c.user_a = uid or c.user_b = uid then
    update public.users set couple_id = c.id where id = uid;
    return c;
  end if;

  if c.user_b is not null then
    raise exception 'This couple is already full' using errcode = 'P0002';
  end if;

  update public.couples set user_b = uid where id = c.id returning * into c;
  update public.users set couple_id = c.id where id = uid;
  return c;
end;
$$;

grant execute on function join_couple_by_invite(text) to authenticated;
