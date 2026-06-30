-- Polar account-level billing for Pinly.

create table if not exists public.billing_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  polar_customer_id text unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('plus', 'pro')),
  source text not null check (source in ('polar', 'activation_code', 'manual')),
  status text not null check (status in ('active', 'trialing', 'canceled', 'expired', 'revoked', 'incomplete')),
  billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  polar_subscription_id text unique,
  polar_product_id text,
  polar_price_id text,
  polar_checkout_id text,
  activation_code text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  polar_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists idx_billing_profiles_polar_customer_id
  on public.billing_profiles(polar_customer_id);

create index if not exists idx_account_subscriptions_user_status
  on public.account_subscriptions(user_id, status);

create index if not exists idx_account_subscriptions_polar_customer_lookup
  on public.account_subscriptions(user_id, source, status);

create index if not exists idx_account_subscriptions_polar_subscription_id
  on public.account_subscriptions(polar_subscription_id);

create index if not exists idx_account_subscriptions_period_end
  on public.account_subscriptions(current_period_end);

alter table public.billing_profiles enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists "Users can read own billing profile"
  on public.billing_profiles;
create policy "Users can read own billing profile"
  on public.billing_profiles for select
  using (user_id = auth.uid());

drop policy if exists "Users can read own account subscriptions"
  on public.account_subscriptions;
create policy "Users can read own account subscriptions"
  on public.account_subscriptions for select
  using (user_id = auth.uid());

create or replace function public.get_account_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when bool_or(plan = 'pro') then 'pro'
        when bool_or(plan = 'plus') then 'plus'
        else 'free'
      end
      from public.account_subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing')
        and (
          s.current_period_end is null
          or s.current_period_end > now()
        )
    ),
    'free'
  );
$$;

create or replace function public.get_owned_space_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.get_account_plan(p_user_id)
    when 'pro' then 3
    when 'plus' then 2
    else 1
  end;
$$;

create or replace function public.get_owned_space_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.spaces s
  where s.owner_id = p_user_id;
$$;

create or replace function public.can_create_owned_space(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_owned_space_count(p_user_id) < public.get_owned_space_limit(p_user_id);
$$;

create or replace function public.get_space_effective_plan(p_space_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_account_plan(s.owner_id), 'free')
  from public.spaces s
  where s.id = p_space_id;
$$;

create or replace function public.get_active_account_subscription(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'plan', s.plan,
    'source', s.source,
    'status', s.status,
    'billing_cycle', s.billing_cycle,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  )
  from public.account_subscriptions s
  where s.user_id = p_user_id
    and s.status in ('active', 'trialing')
    and (
      s.current_period_end is null
      or s.current_period_end > now()
    )
  order by
    case s.plan when 'pro' then 2 when 'plus' then 1 else 0 end desc,
    s.created_at desc
  limit 1;
$$;

create or replace function public.get_plan_limits(p_plan text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(p_plan, 'free')
    when 'pro' then jsonb_build_object(
      'pins', 999999999,
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
      'pins', 100,
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

create or replace function public.get_subscription_context_for_space(p_space_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_space public.spaces;
  v_account_plan text;
  v_space_plan text;
  v_owned_count integer;
  v_owned_limit integer;
begin
  if v_viewer is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select *
    into v_space
  from public.spaces
  where id = p_space_id;

  if v_space.id is null then
    return jsonb_build_object(
      'account_plan', public.get_account_plan(v_viewer),
      'space_plan', 'free',
      'space_owner_id', null,
      'owned_space_count', public.get_owned_space_count(v_viewer),
      'owned_space_limit', public.get_owned_space_limit(v_viewer),
      'can_create_space', public.can_create_owned_space(v_viewer),
      'subscription', public.get_active_account_subscription(v_viewer),
      'limits', public.get_plan_limits('free')
    );
  end if;

  if not public.is_space_member(p_space_id) then
    raise exception 'Not a space member' using errcode = 'P0002';
  end if;

  v_account_plan := public.get_account_plan(v_viewer);
  v_space_plan := public.get_account_plan(v_space.owner_id);
  v_owned_count := public.get_owned_space_count(v_viewer);
  v_owned_limit := public.get_owned_space_limit(v_viewer);

  return jsonb_build_object(
    'account_plan', v_account_plan,
    'space_plan', v_space_plan,
    'space_owner_id', v_space.owner_id,
    'owned_space_count', v_owned_count,
    'owned_space_limit', v_owned_limit,
    'can_create_space', v_owned_count < v_owned_limit,
    'subscription', public.get_active_account_subscription(v_viewer),
    'limits', public.get_plan_limits(v_space_plan)
  );
end;
$$;

create or replace function public.get_subscription_context_for_couple(p_couple_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.get_subscription_context_for_space(p_couple_id);
$$;

create or replace function public.enforce_owned_space_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    raise exception 'Space owner is required' using errcode = 'PBL00';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  if not public.can_create_owned_space(new.owner_id) then
    raise exception 'Owned space limit reached for current plan'
      using errcode = 'PBL01';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_owned_space_limit on public.spaces;
create trigger enforce_owned_space_limit
  before insert on public.spaces
  for each row execute function public.enforce_owned_space_limit();

create or replace function public.activate_account_code(
  p_user_id uuid,
  p_code text,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_email text := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_code_record public.activation_codes%rowtype;
  v_couple_id uuid;
  v_plan text;
  v_duration_days integer;
  v_now timestamptz := now();
  v_period_end timestamptz;
begin
  if v_code = '' then
    return jsonb_build_object(
      'success', false,
      'status', 400,
      'error', 'Code is required'
    );
  end if;

  if length(v_code) > 64 then
    return jsonb_build_object(
      'success', false,
      'status', 400,
      'error', 'Code is too long'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
    into v_code_record
  from public.activation_codes
  where code = v_code
  for update;

  if v_code_record.id is null then
    return jsonb_build_object(
      'success', false,
      'status', 404,
      'error', 'Mã không hợp lệ'
    );
  end if;

  if v_code_record.used_at is not null
    or v_code_record.used_by_couple_id is not null then
    return jsonb_build_object(
      'success', false,
      'status', 400,
      'error', 'Mã đã được sử dụng'
    );
  end if;

  if v_code_record.expires_at is not null
    and v_code_record.expires_at < v_now then
    return jsonb_build_object(
      'success', false,
      'status', 400,
      'error', 'Mã đã hết hạn'
    );
  end if;

  v_plan := v_code_record.plan;
  v_duration_days := v_code_record.duration_days;

  if v_plan not in ('plus', 'pro')
    or v_duration_days is null
    or v_duration_days <= 0 then
    return jsonb_build_object(
      'success', false,
      'status', 404,
      'error', 'Mã không hợp lệ'
    );
  end if;

  select couple_id
    into v_couple_id
  from public.users
  where id = p_user_id;

  v_period_end := v_now + (v_duration_days * interval '1 day');

  update public.account_subscriptions
  set
    status = 'expired',
    updated_at = v_now
  where user_id = p_user_id
    and source = 'activation_code'
    and status in ('active', 'trialing');

  insert into public.account_subscriptions (
    user_id,
    plan,
    source,
    billing_cycle,
    status,
    current_period_start,
    current_period_end,
    activation_code
  )
  values (
    p_user_id,
    v_plan,
    'activation_code',
    case when v_duration_days >= 365 then 'annual' else 'monthly' end,
    'active',
    v_now,
    v_period_end,
    v_code
  );

  insert into public.billing_profiles (
    user_id,
    email,
    updated_at
  )
  values (
    p_user_id,
    v_email,
    v_now
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    updated_at = excluded.updated_at;

  update public.activation_codes
  set
    used_by_couple_id = v_couple_id,
    used_at = v_now
  where id = v_code_record.id;

  return jsonb_build_object(
    'success', true,
    'plan', v_plan,
    'expires_at', v_period_end,
    'message', 'Đã kích hoạt gói '
      || case when v_plan = 'pro' then 'Pro' else 'Plus' end
      || ' đến '
      || to_char(v_period_end, 'DD/MM/YYYY')
  );
end;
$$;

revoke all on function public.get_account_plan(uuid) from public, anon, authenticated;
grant execute on function public.get_account_plan(uuid) to service_role;

revoke all on function public.get_owned_space_limit(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_space_limit(uuid) to service_role;

revoke all on function public.get_owned_space_count(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_space_count(uuid) to service_role;

revoke all on function public.can_create_owned_space(uuid) from public, anon, authenticated;
grant execute on function public.can_create_owned_space(uuid) to service_role;

revoke all on function public.get_space_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.get_space_effective_plan(uuid) to service_role;

revoke all on function public.get_active_account_subscription(uuid) from public, anon, authenticated;
grant execute on function public.get_active_account_subscription(uuid) to service_role;

revoke all on function public.get_plan_limits(text) from public, anon;
grant execute on function public.get_plan_limits(text) to authenticated, service_role;

revoke all on function public.get_subscription_context_for_space(uuid) from public, anon;
grant execute on function public.get_subscription_context_for_space(uuid) to authenticated;

revoke all on function public.get_subscription_context_for_couple(uuid) from public, anon;
grant execute on function public.get_subscription_context_for_couple(uuid) to authenticated;

revoke all on function public.enforce_owned_space_limit() from public, anon, authenticated;
grant execute on function public.enforce_owned_space_limit() to service_role;

revoke all on function public.activate_account_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_account_code(uuid, text, text) to service_role;

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

  v_limit := case v_space_plan
    when 'pro' then 999999999
    when 'plus' then 300
    else 100
  end;

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

drop trigger if exists trg_check_pin_limit on public.pins;
create trigger trg_check_pin_limit
  before insert on public.pins
  for each row execute function public.check_pin_limit();

create or replace function public.check_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_space_plan text;
  v_photo_count integer;
  v_limit integer;
begin
  select coalesce(p.space_id, p.couple_id)
    into v_space_id
  from public.pins p
  where p.id = new.pin_id;

  v_space_plan := coalesce(public.get_space_effective_plan(v_space_id), 'free');

  v_limit := case v_space_plan
    when 'pro' then 5
    when 'plus' then 5
    else 3
  end;

  select count(*)
    into v_photo_count
  from public.pin_images
  where pin_id = new.pin_id;

  if v_photo_count >= v_limit then
    raise exception 'Photo limit reached for your plan. Upgrade to add more photos.'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_photo_limit on public.pin_images;
create trigger trg_check_photo_limit
  before insert on public.pin_images
  for each row execute function public.check_photo_limit();

create or replace function public.check_video_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_space_plan text;
begin
  if new.cloudinary_url not ilike '%/video/upload/%' then
    return new;
  end if;

  select coalesce(p.space_id, p.couple_id)
    into v_space_id
  from public.pins p
  where p.id = new.pin_id;

  v_space_plan := coalesce(public.get_space_effective_plan(v_space_id), 'free');

  if v_space_plan is distinct from 'pro' then
    raise exception 'Video upload requires Pro.'
      using errcode = 'P0003';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_video_upload on public.pin_images;
create trigger trg_check_video_upload
  before insert on public.pin_images
  for each row execute function public.check_video_upload();

create or replace function public.check_custom_category_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_space_plan text;
  v_cat_count integer;
  v_limit integer;
begin
  select coalesce(new.space_id, new.couple_id)
    into v_space_id;

  v_space_plan := coalesce(public.get_space_effective_plan(v_space_id), 'free');

  v_limit := case v_space_plan
    when 'pro' then 999999999
    when 'plus' then 5
    else 0
  end;

  select count(*)
    into v_cat_count
  from public.custom_categories
  where coalesce(space_id, couple_id) = v_space_id;

  if v_cat_count >= v_limit then
    raise exception 'Custom category limit reached for your plan. Upgrade to create more.'
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_custom_category_limit on public.custom_categories;
create trigger trg_check_custom_category_limit
  before insert on public.custom_categories
  for each row execute function public.check_custom_category_limit();
