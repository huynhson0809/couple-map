-- Add background image for couple. Anniversary date column already exists in schema.sql.
-- Run in Supabase SQL Editor.

alter table public.couples
  add column if not exists background_image_url text;
