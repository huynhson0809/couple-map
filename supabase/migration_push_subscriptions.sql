-- Web Push Subscriptions table + RLS
-- Run in Supabase SQL Editor.

-- ============================================
-- 1. TABLE
-- ============================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique(endpoint)
);

-- ============================================
-- 2. RLS
-- ============================================

alter table public.push_subscriptions enable row level security;

-- Users can read their own subscriptions
create policy "Users can read own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

-- Users can insert their own subscriptions
create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

-- Users can delete their own subscriptions
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Service role (Edge Function) needs to read partner subscriptions
-- This is handled by using service_role key in the Edge Function
