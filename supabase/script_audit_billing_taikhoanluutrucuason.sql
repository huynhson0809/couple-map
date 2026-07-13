-- Audit billing records for one account before clearing any Polar customer id.
-- Run in Supabase SQL Editor.

with target_user as (
  select u.id, u.email, u.created_at
  from public.users u
  where lower(u.email) = lower('taikhoanluutrucuason@gmail.com')
  order by u.created_at desc
  limit 1
)
select
  'billing_profile' as record_type,
  tu.id as user_id,
  tu.email as user_email,
  bp.email as billing_email,
  bp.polar_customer_id,
  null::text as subscription_id,
  null::text as plan,
  null::text as source,
  null::text as status,
  null::text as billing_cycle,
  null::text as polar_subscription_id,
  null::text as polar_product_id,
  null::text as polar_checkout_id,
  null::timestamptz as current_period_start,
  null::timestamptz as current_period_end,
  bp.created_at,
  bp.updated_at
from target_user tu
left join public.billing_profiles bp
  on bp.user_id = tu.id

union all

select
  'account_subscription' as record_type,
  tu.id as user_id,
  tu.email as user_email,
  null::text as billing_email,
  null::text as polar_customer_id,
  s.id::text as subscription_id,
  s.plan,
  s.source,
  s.status,
  s.billing_cycle,
  s.polar_subscription_id,
  s.polar_product_id,
  s.polar_checkout_id,
  s.current_period_start,
  s.current_period_end,
  s.created_at,
  s.updated_at
from target_user tu
join public.account_subscriptions s
  on s.user_id = tu.id
order by record_type, created_at desc;
