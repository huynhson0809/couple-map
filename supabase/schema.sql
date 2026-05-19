-- Couple Map — full schema. Run in Supabase SQL Editor.

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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
create index idx_pins_location on public.pins(lat, lng);
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
alter publication supabase_realtime add table public.pin_images;

-- ============================================
-- 5. FUNCTIONS / TRIGGERS
-- ============================================

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
