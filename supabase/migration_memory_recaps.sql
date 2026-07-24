-- Range-based memory recaps. A calendar-year Replay is one preset of this model.

create table if not exists public.memory_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  preset text not null default 'custom'
    check (preset in ('calendar_year', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'finalized')),
  template_id text not null default 'journey'
    check (template_id in ('journey', 'scrapbook', 'film')),
  snapshot_json jsonb not null default '{}'::jsonb,
  slide_config_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_recaps_valid_range check (range_end >= range_start),
  constraint memory_recaps_unique_range
    unique (user_id, space_id, range_start, range_end)
);

create index if not exists idx_memory_recaps_user_generated
  on public.memory_recaps(user_id, generated_at desc);

create index if not exists idx_memory_recaps_space_range
  on public.memory_recaps(space_id, range_start, range_end);

alter table public.memory_recaps enable row level security;

drop policy if exists "Users can read own memory recaps"
  on public.memory_recaps;
create policy "Users can read own memory recaps"
  on public.memory_recaps for select
  using (
    user_id = auth.uid()
    and public.is_space_member(space_id)
  );

drop policy if exists "Users can create own memory recaps"
  on public.memory_recaps;
create policy "Users can create own memory recaps"
  on public.memory_recaps for insert
  with check (
    user_id = auth.uid()
    and public.is_space_member(space_id)
  );

drop policy if exists "Users can update own memory recaps"
  on public.memory_recaps;
create policy "Users can update own memory recaps"
  on public.memory_recaps for update
  using (
    user_id = auth.uid()
    and public.is_space_member(space_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_space_member(space_id)
  );

drop policy if exists "Users can delete own memory recaps"
  on public.memory_recaps;
create policy "Users can delete own memory recaps"
  on public.memory_recaps for delete
  using (
    user_id = auth.uid()
    and public.is_space_member(space_id)
  );

create or replace function public.enforce_memory_recap_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_plan text;
begin
  viewer_plan := public.get_account_plan(new.user_id);

  if new.template_id = 'scrapbook' and viewer_plan = 'free' then
    raise exception 'Scrapbook Replay requires Plus or Pro'
      using errcode = 'PBL01';
  end if;

  if new.template_id = 'film' and viewer_plan <> 'pro' then
    raise exception 'Film Diary Replay requires Pro'
      using errcode = 'PBL01';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_memory_recap_entitlements_trigger
  on public.memory_recaps;
create trigger enforce_memory_recap_entitlements_trigger
  before insert or update of template_id on public.memory_recaps
  for each row execute function public.enforce_memory_recap_entitlements();

drop trigger if exists memory_recaps_updated_at
  on public.memory_recaps;
create trigger memory_recaps_updated_at
  before update on public.memory_recaps
  for each row execute function public.update_updated_at();

grant select, insert, update, delete on public.memory_recaps to authenticated;

revoke all on function public.enforce_memory_recap_entitlements()
  from public, anon, authenticated;
grant execute on function public.enforce_memory_recap_entitlements()
  to service_role;

