-- Migration: Subscription system for Pinly
-- Adds plan support to couples, subscriptions table, activation codes

-- ============================================
-- 1. Add plan column to couples
-- ============================================

alter table public.couples
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'plus', 'pro'));

-- ============================================
-- 2. Subscriptions table
-- ============================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  plan text not null check (plan in ('plus', 'pro')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  activated_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_couple_id on public.subscriptions(couple_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

-- ============================================
-- 3. Activation codes table
-- ============================================

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  plan text not null check (plan in ('plus', 'pro')),
  duration_days integer not null default 30, -- 30 = monthly, 365 = annual
  used_by_couple_id uuid references public.couples(id),
  used_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz -- code itself can expire if unused
);

create unique index if not exists idx_activation_codes_code on public.activation_codes(code);

-- ============================================
-- 4. RLS
-- ============================================

alter table public.subscriptions enable row level security;
alter table public.activation_codes enable row level security;

-- Couples can read their own subscription
drop policy if exists "Couple members can read own subscription"
  on public.subscriptions;
create policy "Couple members can read own subscription"
  on public.subscriptions for select
  using (couple_id = get_my_couple_id());

-- No direct user access to activation_codes (only via Edge Function with service_role)

-- ============================================
-- 5. Helper function: get couple plan
-- ============================================

create or replace function get_couple_plan()
returns text as $$
  select coalesce(
    (select plan from public.couples where id = get_my_couple_id()),
    'free'
  )
$$ language sql security definer stable;

create or replace function public.get_subscription_context_for_couple(
  p_couple_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with requested_couple as (
    select c.id, coalesce(c.plan, 'free')::text as plan
    from public.couples c
    where c.id = p_couple_id
      and auth.uid() is not null
      and (
        c.user_a = auth.uid()
        or c.user_b = auth.uid()
        or c.id = public.get_my_couple_id()
      )
    limit 1
  ),
  active_subscription as (
    select
      s.id,
      s.couple_id,
      s.plan,
      s.billing_cycle,
      s.status,
      s.current_period_start,
      s.current_period_end,
      s.created_at
    from public.subscriptions s
    join requested_couple c on c.id = s.couple_id
    where s.status = 'active'
    order by s.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'plan',
    coalesce((select plan from requested_couple), 'free'),
    'subscription',
    (select to_jsonb(active_subscription) from active_subscription)
  );
$$;

revoke all on function public.get_subscription_context_for_couple(uuid)
  from public, anon;
grant execute on function public.get_subscription_context_for_couple(uuid)
  to authenticated;

-- ============================================
-- 6. Pin limit enforcement trigger
-- ============================================

create or replace function check_pin_limit()
returns trigger as $$
declare
  v_couple_plan text;
  v_pin_count integer;
  v_limit integer;
begin
  select plan into v_couple_plan
    from public.couples where id = NEW.couple_id;

  -- Determine limit based on plan
  v_limit := case v_couple_plan
    when 'pro' then 999999999  -- unlimited
    when 'plus' then 500
    else 100  -- free
  end;

  -- Count existing pins for this couple
  select count(*) into v_pin_count
    from public.pins where couple_id = NEW.couple_id;

  if v_pin_count >= v_limit then
    raise exception 'Pin limit reached for your plan. Upgrade to create more memories.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_pin_limit on public.pins;
create trigger trg_check_pin_limit
  before insert on public.pins
  for each row execute function check_pin_limit();

-- ============================================
-- 7. Photo limit enforcement trigger
-- ============================================

create or replace function check_photo_limit()
returns trigger as $$
declare
  v_couple_plan text;
  v_photo_count integer;
  v_limit integer;
  v_couple_id uuid;
begin
  -- Get couple_id from the pin
  select couple_id into v_couple_id
    from public.pins where id = NEW.pin_id;

  select plan into v_couple_plan
    from public.couples where id = v_couple_id;

  -- Determine limit based on plan
  v_limit := case v_couple_plan
    when 'pro' then 5
    when 'plus' then 5
    else 3  -- free
  end;

  -- Count existing images for this pin
  select count(*) into v_photo_count
    from public.pin_images where pin_id = NEW.pin_id;

  if v_photo_count >= v_limit then
    raise exception 'Photo limit reached for your plan. Upgrade to add more photos.'
      using errcode = 'P0002';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_photo_limit on public.pin_images;
create trigger trg_check_photo_limit
  before insert on public.pin_images
  for each row execute function check_photo_limit();

-- ============================================
-- 8. Video upload enforcement trigger
-- ============================================

create or replace function check_video_upload()
returns trigger as $$
declare
  v_couple_plan text;
  v_couple_id uuid;
begin
  -- Only check video files
  if NEW.cloudinary_url not ilike '%/video/upload/%' then
    return NEW;
  end if;

  -- Get couple_id from the pin
  select couple_id into v_couple_id
    from public.pins where id = NEW.pin_id;

  select plan into v_couple_plan
    from public.couples where id = v_couple_id;

  if v_couple_plan is distinct from 'pro' then
    raise exception 'Video upload requires Pro.'
      using errcode = 'P0003';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_video_upload on public.pin_images;
create trigger trg_check_video_upload
  before insert on public.pin_images
  for each row execute function check_video_upload();

-- ============================================
-- 9. Custom category limit enforcement
-- ============================================

create or replace function check_custom_category_limit()
returns trigger as $$
declare
  v_couple_plan text;
  v_cat_count integer;
  v_limit integer;
begin
  select plan into v_couple_plan
    from public.couples where id = NEW.couple_id;

  -- Determine limit based on plan
  v_limit := case v_couple_plan
    when 'pro' then 999999999  -- unlimited
    when 'plus' then 5
    else 0  -- free: no custom categories
  end;

  -- Count existing custom categories
  select count(*) into v_cat_count
    from public.custom_categories where couple_id = NEW.couple_id;

  if v_cat_count >= v_limit then
    raise exception 'Custom category limit reached for your plan. Upgrade to create more.'
      using errcode = 'P0004';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_custom_category_limit on public.custom_categories;
create trigger trg_check_custom_category_limit
  before insert on public.custom_categories
  for each row execute function check_custom_category_limit();

-- ============================================
-- 10. Subscription expiry function (run via cron daily)
-- ============================================

create or replace function expire_subscriptions()
returns void as $$
begin
  -- Mark expired subscriptions
  update public.subscriptions
    set status = 'expired', updated_at = now()
    where status = 'active'
      and current_period_end < now();

  -- Downgrade couples whose active subscription has expired
  update public.couples c
    set plan = 'free'
    where c.plan != 'free'
      and not exists (
        select 1 from public.subscriptions s
        where s.couple_id = c.id and s.status = 'active'
      );
end;
$$ language plpgsql security definer;

-- Schedule: run daily at 00:05 UTC
-- In Supabase Dashboard → Database → Extensions → enable pg_cron
-- Then run:
-- select cron.schedule('expire-subscriptions', '5 0 * * *', 'select expire_subscriptions()');
