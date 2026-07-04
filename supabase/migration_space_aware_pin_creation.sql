-- Space-aware pin creation and media validation.
-- Apply after migration_memory_spaces.sql and migration_polar_billing.sql.

create or replace function public.effective_pin_space_id(
  p_space_id uuid,
  p_couple_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_space_id,
    (
      select s.id
      from public.spaces s
      where s.id = p_couple_id
         or s.legacy_couple_id = p_couple_id
      limit 1
    ),
    p_couple_id
  );
$$;

create or replace function public.set_pin_categories(
  in_pin_id uuid,
  in_category_ids text[]
)
returns table(
  pin_id uuid,
  couple_id uuid,
  category_id text,
  category_position int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple_id uuid;
  target_space_id uuid;
  primary_category_id text;
begin
  select p.couple_id, public.effective_pin_space_id(p.space_id, p.couple_id)
    into target_couple_id, target_space_id
  from public.pins p
  where p.id = in_pin_id;

  if target_couple_id is null then
    raise exception 'Pin not found' using errcode = 'P0001';
  end if;

  if not public.is_space_member(target_space_id) then
    raise exception 'Not a space member' using errcode = 'P0002';
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

  insert into public.pin_categories (
    pin_id,
    space_id,
    couple_id,
    category_id,
    position
  )
  select
    in_pin_id,
    target_space_id,
    target_couple_id,
    n.category_id,
    n.category_position
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
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  primary_category_id text;
  v_space_id uuid := in_couple_id;
  v_legacy_couple_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if in_created_by is distinct from uid then
    raise exception 'Cannot create memory for another user' using errcode = 'P0002';
  end if;

  if not public.is_space_member(v_space_id) then
    raise exception 'Not a space member' using errcode = 'P0003';
  end if;

  v_legacy_couple_id := public.ensure_space_legacy_couple(v_space_id);

  select n.category_id
    into primary_category_id
  from public.normalized_pin_category_ids(in_category_ids) n
  order by n.category_position
  limit 1;

  insert into public.pins (
    space_id,
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
    v_space_id,
    v_legacy_couple_id,
    uid,
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

create or replace function public.validate_pin_image_media_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_space_id uuid;
begin
  select public.effective_pin_space_id(p.space_id, p.couple_id)
    into v_effective_space_id
  from public.pins p
  where p.id = new.pin_id;

  if v_effective_space_id is null then
    raise exception 'Pin image must reference an existing pin';
  end if;

  if new.cloudinary_public_id is null
    or new.cloudinary_public_id not like 'pinly/' || v_effective_space_id::text || '/%'
  then
    raise exception 'Cloudinary public id does not belong to this space';
  end if;

  if new.cloudinary_url not like '%/pinly/' || v_effective_space_id::text || '/%' then
    raise exception 'Cloudinary URL does not belong to this space';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_pin_image_media_fields on public.pin_images;
create trigger validate_pin_image_media_fields
  before insert or update on public.pin_images
  for each row execute function public.validate_pin_image_media_fields();

drop policy if exists "Couple members can read their pins" on public.pins;
create policy "Couple members can read their pins"
  on public.pins for select
  using (public.is_space_member(coalesce(space_id, couple_id)));

drop policy if exists "Couple members can create pins" on public.pins;
create policy "Couple members can create pins"
  on public.pins for insert
  with check (
    created_by = auth.uid()
    and public.is_space_member(coalesce(space_id, couple_id))
  );

drop policy if exists "Couple members can update their pins" on public.pins;
create policy "Couple members can update their pins"
  on public.pins for update
  using (public.is_space_member(coalesce(space_id, couple_id)))
  with check (public.is_space_member(coalesce(space_id, couple_id)));

drop policy if exists "Couple members can delete their pins" on public.pins;
create policy "Couple members can delete their pins"
  on public.pins for delete
  using (public.is_space_member(coalesce(space_id, couple_id)));

drop policy if exists "Couple members can read pin categories" on public.pin_categories;
create policy "Couple members can read pin categories"
  on public.pin_categories for select
  using (public.is_space_member(coalesce(space_id, couple_id)));

drop policy if exists "Couple members can insert pin categories" on public.pin_categories;
create policy "Couple members can insert pin categories"
  on public.pin_categories for insert
  with check (
    public.is_space_member(coalesce(space_id, couple_id))
    and exists (
      select 1
      from public.pins p
      where p.id = pin_categories.pin_id
        and public.effective_pin_space_id(p.space_id, p.couple_id)
          = coalesce(pin_categories.space_id, pin_categories.couple_id)
    )
  );

drop policy if exists "Couple members can update pin categories" on public.pin_categories;
create policy "Couple members can update pin categories"
  on public.pin_categories for update
  using (public.is_space_member(coalesce(space_id, couple_id)))
  with check (
    public.is_space_member(coalesce(space_id, couple_id))
    and exists (
      select 1
      from public.pins p
      where p.id = pin_categories.pin_id
        and public.effective_pin_space_id(p.space_id, p.couple_id)
          = coalesce(pin_categories.space_id, pin_categories.couple_id)
    )
  );

drop policy if exists "Couple members can delete pin categories" on public.pin_categories;
create policy "Couple members can delete pin categories"
  on public.pin_categories for delete
  using (public.is_space_member(coalesce(space_id, couple_id)));

drop policy if exists "Couple members can read pin images" on public.pin_images;
create policy "Couple members can read pin images"
  on public.pin_images for select
  using (
    exists (
      select 1
      from public.pins p
      where p.id = pin_images.pin_id
        and public.is_space_member(public.effective_pin_space_id(p.space_id, p.couple_id))
    )
  );

drop policy if exists "Couple members can insert pin images" on public.pin_images;
create policy "Couple members can insert pin images"
  on public.pin_images for insert
  with check (
    exists (
      select 1
      from public.pins p
      where p.id = pin_images.pin_id
        and public.is_space_member(public.effective_pin_space_id(p.space_id, p.couple_id))
    )
  );

drop policy if exists "Couple members can delete pin images" on public.pin_images;
create policy "Couple members can delete pin images"
  on public.pin_images for delete
  using (
    exists (
      select 1
      from public.pins p
      where p.id = pin_images.pin_id
        and public.is_space_member(public.effective_pin_space_id(p.space_id, p.couple_id))
    )
  );

update public.pins p
set space_id = public.effective_pin_space_id(p.space_id, p.couple_id)
where p.space_id is null;

update public.pin_categories pc
set space_id = public.effective_pin_space_id(pc.space_id, pc.couple_id)
where pc.space_id is null;

revoke all on function public.effective_pin_space_id(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.effective_pin_space_id(uuid, uuid)
  to authenticated, service_role;
