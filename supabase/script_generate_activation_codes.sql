-- Generate activation codes for Pinly subscriptions
-- Run in Supabase SQL Editor when you need to create codes for customers

-- Generate 1 Plus monthly code (30 days)
insert into public.activation_codes (code, plan, duration_days, expires_at)
values (
  upper(substring(md5(random()::text || now()::text), 1, 8)),
  'plus',
  30,
  now() + interval '30 days' -- code expires in 30 days if unused
);

-- Generate 1 Plus annual code (365 days)
-- insert into public.activation_codes (code, plan, duration_days, expires_at)
-- values (
--   upper(substring(md5(random()::text || now()::text), 1, 8)),
--   'plus',
--   365,
--   now() + interval '30 days'
-- );

-- Generate 1 Pro monthly code (30 days)
-- insert into public.activation_codes (code, plan, duration_days, expires_at)
-- values (
--   upper(substring(md5(random()::text || now()::text), 1, 8)),
--   'pro',
--   30,
--   now() + interval '30 days'
-- );

-- Generate 1 Pro annual code (365 days)
-- insert into public.activation_codes (code, plan, duration_days, expires_at)
-- values (
--   upper(substring(md5(random()::text || now()::text), 1, 8)),
--   'pro',
--   365,
--   now() + interval '30 days'
-- );

-- View all unused codes
select code, plan, duration_days, created_at, expires_at
  from public.activation_codes
  where used_by_couple_id is null
  order by created_at desc;

-- View all used codes
-- select code, plan, duration_days, used_by_couple_id, used_at
--   from public.activation_codes
--   where used_by_couple_id is not null
--   order by used_at desc;
