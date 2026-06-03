-- Rollback: Remove all subscription-related objects
-- Run in Supabase SQL Editor to undo migration_subscriptions.sql

-- 1. Remove cron job (if scheduled)
-- select cron.unschedule('expire-subscriptions');

-- 2. Drop triggers
drop trigger if exists trg_check_pin_limit on public.pins;
drop trigger if exists trg_check_photo_limit on public.pin_images;
drop trigger if exists trg_check_video_upload on public.pin_images;
drop trigger if exists trg_check_custom_category_limit on public.custom_categories;

-- 3. Drop functions
drop function if exists check_pin_limit();
drop function if exists check_photo_limit();
drop function if exists check_video_upload();
drop function if exists check_custom_category_limit();
drop function if exists expire_subscriptions();
drop function if exists get_couple_plan();

-- 4. Drop tables (payment_history depends on subscriptions)
drop table if exists public.payment_history;
drop table if exists public.activation_codes;
drop table if exists public.subscriptions;

-- 5. Remove plan column from couples
alter table public.couples drop column if exists plan;
