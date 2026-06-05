-- API performance helpers for app context and aggregate stats.
-- Run after the base schema and security hardening migrations.

create index if not exists idx_pins_couple_created_desc
  on public.pins(couple_id, created_at desc);

create index if not exists idx_pins_couple_category_created
  on public.pins(couple_id, category, created_at desc);

create index if not exists idx_pins_couple_created_by_created
  on public.pins(couple_id, created_by, created_at desc);

create index if not exists idx_bucket_list_couple_status_created
  on public.bucket_list(couple_id, status, created_at desc);

create index if not exists idx_pin_images_pin_sort_lookup
  on public.pin_images(pin_id, sort_order);

create or replace function public.get_couple_context_for_current_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  profile_json jsonb;
  couple_row public.couples;
  couple_json jsonb;
  partner_json jsonb;
  partner_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select to_jsonb(u) into profile_json
  from public.users u
  where u.id = uid;

  if profile_json is null then
    return jsonb_build_object('profile', null, 'couple', null, 'partner', null);
  end if;

  if profile_json->>'couple_id' is null then
    return jsonb_build_object('profile', profile_json, 'couple', null, 'partner', null);
  end if;

  select * into couple_row
  from public.couples c
  where c.id = (profile_json->>'couple_id')::uuid
    and (c.user_a = uid or c.user_b = uid);

  if couple_row.id is null then
    return jsonb_build_object('profile', profile_json, 'couple', null, 'partner', null);
  end if;

  couple_json := to_jsonb(couple_row);
  partner_id := case
    when couple_row.user_a = uid then couple_row.user_b
    else couple_row.user_a
  end;

  if partner_id is not null then
    select to_jsonb(u) into partner_json
    from public.users u
    where u.id = partner_id
      and u.couple_id = couple_row.id;
  end if;

  return jsonb_build_object(
    'profile', profile_json,
    'couple', couple_json,
    'partner', partner_json
  );
end;
$$;

revoke all on function public.get_couple_context_for_current_user() from public, anon;
grant execute on function public.get_couple_context_for_current_user() to authenticated;

create or replace function public.get_couple_stats_summary(target_couple_id uuid)
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
    (select count(*)::bigint from public.pins p where p.couple_id = target_couple_id) as total_pins,
    coalesce(
      (
        select array_agg(city order by city)
        from (
          select distinct nullif(trim(p.city), '') as city
          from public.pins p
          where p.couple_id = target_couple_id
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
          where p.couple_id = target_couple_id
            and nullif(trim(p.country), '') is not null
        ) countries
      ),
      array[]::text[]
    ) as country_list,
    (select min(p.created_at) from public.pins p where p.couple_id = target_couple_id) as first_pin_at;
$$;

revoke all on function public.get_couple_stats_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_couple_stats_summary(uuid) to service_role;
