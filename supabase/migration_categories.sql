-- Run this in Supabase SQL Editor if you already applied schema.sql earlier.
-- It adds the `category` column to pins.

alter table public.pins add column if not exists category text;
create index if not exists idx_pins_category on public.pins(category);
