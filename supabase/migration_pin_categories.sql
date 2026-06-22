-- Ordered categories for each memory.
-- Run in Supabase SQL Editor after the custom category migration.

create table if not exists public.pin_categories (
  pin_id uuid not null references public.pins(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  category_id text not null,
  position int not null,
  created_at timestamptz default now(),
  primary key (pin_id, category_id),
  unique (pin_id, position),
  check (position >= 0 and position < 3)
);

create index if not exists idx_pin_categories_couple_category_pin
  on public.pin_categories(couple_id, category_id, pin_id);

create index if not exists idx_pin_categories_pin_position
  on public.pin_categories(pin_id, position);

alter table public.pin_categories enable row level security;

drop policy if exists "Couple members can read pin categories" on public.pin_categories;
drop policy if exists "Couple members can insert pin categories" on public.pin_categories;
drop policy if exists "Couple members can update pin categories" on public.pin_categories;
drop policy if exists "Couple members can delete pin categories" on public.pin_categories;

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

insert into public.pin_categories (pin_id, couple_id, category_id, position)
select id, couple_id, category, 0
from public.pins
where category is not null
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pin_categories'
  ) then
    alter publication supabase_realtime add table public.pin_categories;
  end if;
end $$;
