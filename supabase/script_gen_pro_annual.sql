-- Generate 1 Pro annual code (365 days)
insert into public.activation_codes (code, plan, duration_days, expires_at)
values (
  upper(substring(md5(random()::text || now()::text), 1, 8)),
  'pro',
  365,
  now() + interval '90 days' -- code expires in 90 days if unused
);

-- Show the generated code
select code, plan, duration_days, created_at, expires_at
  from public.activation_codes
  where used_by_couple_id is null
  order by created_at desc
  limit 1;
