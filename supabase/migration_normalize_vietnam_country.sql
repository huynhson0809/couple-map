-- Normalize existing Vietnam country variants so stats do not count them twice.

update public.pins
set country = 'Việt Nam'
where country is not null
  and trim(lower(regexp_replace(country, '\s+', ' ', 'g'))) in (
    'vn',
    'viet nam',
    'vietnam',
    'việt nam',
    'socialist republic of viet nam',
    'socialist republic of vietnam',
    'cộng hòa xã hội chủ nghĩa việt nam',
    'cong hoa xa hoi chu nghia viet nam'
  );

select country, count(*) as memories
from public.pins
group by country
order by memories desc;
