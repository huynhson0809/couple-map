-- Custom marker per pin: emoji override and/or uploaded image URL.
-- Run this in Supabase SQL Editor.

alter table public.pins
  add column if not exists marker_emoji text,
  add column if not exists marker_image_url text;
