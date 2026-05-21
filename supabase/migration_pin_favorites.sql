-- Favorite / prioritized memories.
-- Run in Supabase SQL Editor.

alter table public.pins
  add column if not exists is_favorite boolean not null default false;

create index if not exists idx_pins_favorite
  on public.pins(couple_id, is_favorite, created_at desc);
