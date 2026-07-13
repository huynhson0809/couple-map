-- Let the timeline search match both memory titles and location fields.
-- The existing in_address parameter is retained for backward compatibility.

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
        or p.title ilike '%' || trim(in_address) || '%'
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

