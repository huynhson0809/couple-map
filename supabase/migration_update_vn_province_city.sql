-- Recompute pins.city as the current Vietnam province-level unit.
-- This avoids counting commune/district segments such as "Nguyệt Hóa" as cities.
-- Safe for Supabase SQL Editor: no temporary table, no multi-statement temp state.

with vn_province_groups(canonical, aliases) as (
  values
    ('Tuyên Quang', array['Tuyên Quang','Hà Giang']),
    ('Lào Cai', array['Lào Cai','Yên Bái']),
    ('Thái Nguyên', array['Thái Nguyên','Bắc Kạn']),
    ('Phú Thọ', array['Phú Thọ','Vĩnh Phúc','Hòa Bình']),
    ('Bắc Ninh', array['Bắc Ninh','Bắc Giang']),
    ('Hưng Yên', array['Hưng Yên','Thái Bình']),
    ('Hải Phòng', array['Hải Phòng','Hải Dương']),
    ('Ninh Bình', array['Ninh Bình','Hà Nam','Nam Định']),
    ('Quảng Trị', array['Quảng Trị','Quảng Bình']),
    ('Đà Nẵng', array['Đà Nẵng','Da Nang','Quảng Nam']),
    ('Quảng Ngãi', array['Quảng Ngãi','Kon Tum']),
    ('Gia Lai', array['Gia Lai','Bình Định']),
    ('Khánh Hòa', array['Khánh Hòa','Ninh Thuận']),
    ('Lâm Đồng', array['Lâm Đồng','Đắk Nông','Bình Thuận']),
    ('Đắk Lắk', array['Đắk Lắk','Đắc Lắc','Phú Yên']),
    ('Thành phố Hồ Chí Minh', array['Thành phố Hồ Chí Minh','TP. Hồ Chí Minh','TP Hồ Chí Minh','Hồ Chí Minh','Ho Chi Minh City','Sài Gòn','Saigon','Bình Dương','Bà Rịa - Vũng Tàu','Bà Rịa-Vũng Tàu']),
    ('Đồng Nai', array['Đồng Nai','Bình Phước']),
    ('Tây Ninh', array['Tây Ninh','Long An']),
    ('Cần Thơ', array['Cần Thơ','Can Tho','Sóc Trăng','Hậu Giang']),
    ('Vĩnh Long', array['Vĩnh Long','Trà Vinh','Bến Tre']),
    ('Đồng Tháp', array['Đồng Tháp','Tiền Giang']),
    ('Cà Mau', array['Cà Mau','Bạc Liêu']),
    ('An Giang', array['An Giang','Kiên Giang']),
    ('Cao Bằng', array['Cao Bằng']),
    ('Điện Biên', array['Điện Biên']),
    ('Hà Tĩnh', array['Hà Tĩnh']),
    ('Lai Châu', array['Lai Châu']),
    ('Lạng Sơn', array['Lạng Sơn']),
    ('Nghệ An', array['Nghệ An']),
    ('Quảng Ninh', array['Quảng Ninh']),
    ('Thanh Hóa', array['Thanh Hóa']),
    ('Sơn La', array['Sơn La']),
    ('Hà Nội', array['Hà Nội','Ha Noi','Hanoi']),
    ('Huế', array['Huế','Thừa Thiên Huế','Hue'])
),
aliases as (
  select
    canonical,
    lower(
      regexp_replace(
        regexp_replace(trim(alias), '\s+', ' ', 'g'),
        '^(tỉnh|thành phố|tp\.?|tp|province|city)\s+',
        '',
        'i'
      )
    ) as alias_key
  from vn_province_groups, unnest(aliases) as alias
),
segments as (
  select
    p.id,
    s.ord,
    trim(regexp_replace(s.part, '\s+', ' ', 'g')) as segment
  from public.pins p
  cross join lateral unnest(string_to_array(coalesce(p.address, ''), ',')) with ordinality as s(part, ord)
  where p.address is not null and p.address <> ''
),
chosen_from_address as (
  select distinct on (s.id)
    s.id,
    a.canonical as new_city
  from segments s
  join aliases a
    on lower(regexp_replace(s.segment, '^(tỉnh|thành phố|tp\.?|tp|province|city)\s+', '', 'i')) = a.alias_key
  where s.segment !~ '^[0-9][0-9A-Z\- ]{2,9}$'
    and lower(s.segment) not in ('việt nam', 'vietnam')
  order by s.id, s.ord desc
),
chosen_from_city as (
  select
    p.id,
    a.canonical as new_city
  from public.pins p
  join aliases a
    on lower(regexp_replace(trim(coalesce(p.city, '')), '^(tỉnh|thành phố|tp\.?|tp|province|city)\s+', '', 'i')) = a.alias_key
),
chosen as (
  select id, new_city from chosen_from_address
  union
  select c.id, c.new_city
  from chosen_from_city c
  where not exists (select 1 from chosen_from_address a where a.id = c.id)
),
updated as (
  update public.pins p
    set city = c.new_city
  from chosen c
  where p.id = c.id
    and p.city is distinct from c.new_city
  returning p.id, p.address, p.city, p.country
)
select count(*) as updated_rows
from updated;

-- Optional verification query. Run after the update if you want to inspect results.
select id, address, city, country
from public.pins
order by created_at desc
limit 100;
