-- Allow client upserts to refresh an existing push subscription endpoint.

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can update own push subscriptions"
  on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
