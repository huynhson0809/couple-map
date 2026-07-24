-- Align memory quotas across account plans without deleting existing memories.
-- Existing spaces above their new quota remain readable, but cannot add memories.

begin;

create or replace function public.get_plan_limits(p_plan text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(p_plan, 'free')
    when 'pro' then jsonb_build_object(
      'pins', 500,
      'photosPerPin', 5,
      'video', true,
      'mapStyles', 15,
      'customCategories', 999999999,
      'graceperiodDays', 3,
      'collections', 999999999,
      'shareCardWatermark', false,
      'ownedSpaces', 3
    )
    when 'plus' then jsonb_build_object(
      'pins', 300,
      'photosPerPin', 5,
      'video', false,
      'mapStyles', 10,
      'customCategories', 5,
      'graceperiodDays', 1,
      'collections', 3,
      'shareCardWatermark', false,
      'ownedSpaces', 2
    )
    else jsonb_build_object(
      'pins', 50,
      'photosPerPin', 3,
      'video', false,
      'mapStyles', 3,
      'customCategories', 0,
      'graceperiodDays', 0,
      'collections', 0,
      'shareCardWatermark', true,
      'ownedSpaces', 1
    )
  end;
$$;

create or replace function public.check_pin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_space_plan text;
  v_pin_count integer;
  v_limit integer;
begin
  select coalesce(new.space_id, new.couple_id)
    into v_space_id;

  v_space_plan := coalesce(public.get_space_effective_plan(v_space_id), 'free');
  v_limit := coalesce(
    (public.get_plan_limits(v_space_plan) ->> 'pins')::integer,
    50
  );

  select count(*)
    into v_pin_count
  from public.pins
  where coalesce(space_id, couple_id) = v_space_id;

  if v_pin_count >= v_limit then
    raise exception 'Pin limit reached for your plan. Upgrade to create more memories.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.get_plan_limits(text) from public, anon;
grant execute on function public.get_plan_limits(text) to authenticated, service_role;

commit;
