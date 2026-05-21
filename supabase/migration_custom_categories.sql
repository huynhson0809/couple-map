-- Shared custom tags/categories per couple.
-- Run in Supabase SQL Editor.

create table if not exists public.custom_categories (
  couple_id uuid references public.couples(id) on delete cascade not null,
  id text not null,
  created_by uuid references public.users(id),
  label text not null,
  emoji text not null default '🏷️',
  color text not null default '#6b7280',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (couple_id, id)
);

create index if not exists idx_custom_categories_couple_id
  on public.custom_categories(couple_id);

alter table public.custom_categories enable row level security;

drop policy if exists "Couple members can read custom categories" on public.custom_categories;
drop policy if exists "Couple members can insert custom categories" on public.custom_categories;
drop policy if exists "Couple members can update custom categories" on public.custom_categories;
drop policy if exists "Couple members can delete custom categories" on public.custom_categories;

create policy "Couple members can read custom categories"
  on public.custom_categories for select
  using (couple_id = get_my_couple_id());

create policy "Couple members can insert custom categories"
  on public.custom_categories for insert
  with check (couple_id = get_my_couple_id() and created_by = auth.uid());

create policy "Couple members can update custom categories"
  on public.custom_categories for update
  using (couple_id = get_my_couple_id());

create policy "Couple members can delete custom categories"
  on public.custom_categories for delete
  using (couple_id = get_my_couple_id());

drop trigger if exists custom_categories_updated_at on public.custom_categories;
create trigger custom_categories_updated_at
  before update on public.custom_categories
  for each row execute function update_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'custom_categories'
  ) then
    alter publication supabase_realtime add table public.custom_categories;
  end if;
end $$;
