-- Update existing memory locations from "Ho Chi Minh City" to "Thành phố Hồ Chí Minh".
-- Paste into Supabase SQL Editor and run once. The script is idempotent.

with updated as (
  update public.pins
  set
    city = case
      when city = 'Ho Chi Minh City' then 'Thành phố Hồ Chí Minh'
      else city
    end,
    address = case
      when address is not null then replace(address, 'Ho Chi Minh City', 'Thành phố Hồ Chí Minh')
      else address
    end
  where city = 'Ho Chi Minh City'
     or address like '%Ho Chi Minh City%'
  returning id, title, address, city, updated_at
)
select *
from updated
order by updated_at desc;
