-- Re-extract `city` for existing pins by parsing the stored `address`.
-- Strategy:
--   1. split by ", "
--   2. drop the LAST segment (country)
--   3. ignore postal-code-looking segments
--   4. take the last remaining segment as the major city
--
-- Paste into Supabase SQL Editor → Run.

update public.pins p
set city = (
  select trim(part)
  from unnest(string_to_array(p.address, ', ')) with ordinality as t(part, idx)
  where idx < array_length(string_to_array(p.address, ', '), 1)
    and trim(part) !~ '^[0-9][0-9A-Z\- ]{2,9}$'
  order by idx desc
  limit 1
)
where p.address is not null
  and p.address <> '';

-- Preview the result
select id, address, city, country
from public.pins
order by created_at desc
limit 50;
