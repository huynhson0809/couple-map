-- Reactions and comments for Pinly memories.
-- Run in Supabase SQL Editor.

create table if not exists public.pin_reactions (
  pin_id uuid references public.pins(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  reaction text not null default 'love',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (pin_id, user_id)
);

alter table public.pin_reactions
  alter column reaction set default 'love';

alter table public.pin_reactions
  add column if not exists updated_at timestamptz default now();
alter table public.pin_reactions
  alter column updated_at set default now();
update public.pin_reactions
  set updated_at = coalesce(updated_at, created_at, now())
  where updated_at is null;
alter table public.pin_reactions
  alter column updated_at set not null;

update public.pin_reactions
  set reaction = 'love'
  where reaction = 'heart';

alter table public.pin_reactions
  drop constraint if exists pin_reactions_reaction_check;
alter table public.pin_reactions
  add constraint pin_reactions_reaction_check
  check (reaction in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'));

create table if not exists public.pin_comments (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid references public.pins(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pin_reactions_pin_id
  on public.pin_reactions(pin_id);
create index if not exists idx_pin_comments_pin_id_created_at
  on public.pin_comments(pin_id, created_at);

alter table public.pin_reactions enable row level security;
alter table public.pin_comments enable row level security;

drop policy if exists "Couple members can read pin reactions" on public.pin_reactions;
drop policy if exists "Couple members can react to pins" on public.pin_reactions;
drop policy if exists "Couple members can update their pin reactions" on public.pin_reactions;
drop policy if exists "Users can remove their pin reactions" on public.pin_reactions;
drop policy if exists "Couple members can read pin comments" on public.pin_comments;
drop policy if exists "Couple members can comment on pins" on public.pin_comments;
drop policy if exists "Users can update their pin comments" on public.pin_comments;
drop policy if exists "Users can delete their pin comments" on public.pin_comments;

create policy "Couple members can read pin reactions"
  on public.pin_reactions for select
  using (pin_id in (select id from public.pins where couple_id = get_my_couple_id()));

create policy "Couple members can react to pins"
  on public.pin_reactions for insert
  with check (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

create policy "Couple members can update their pin reactions"
  on public.pin_reactions for update
  using (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  )
  with check (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

create policy "Users can remove their pin reactions"
  on public.pin_reactions for delete
  using (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

create policy "Couple members can read pin comments"
  on public.pin_comments for select
  using (pin_id in (select id from public.pins where couple_id = get_my_couple_id()));

create policy "Couple members can comment on pins"
  on public.pin_comments for insert
  with check (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

create policy "Users can update their pin comments"
  on public.pin_comments for update
  using (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

create policy "Users can delete their pin comments"
  on public.pin_comments for delete
  using (
    user_id = auth.uid()
    and pin_id in (select id from public.pins where couple_id = get_my_couple_id())
  );

drop trigger if exists pin_comments_updated_at on public.pin_comments;
create trigger pin_comments_updated_at
  before update on public.pin_comments
  for each row execute function update_updated_at();

drop trigger if exists pin_reactions_updated_at on public.pin_reactions;
create trigger pin_reactions_updated_at
  before update on public.pin_reactions
  for each row execute function update_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pin_reactions'
  ) then
    alter publication supabase_realtime add table public.pin_reactions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pin_comments'
  ) then
    alter publication supabase_realtime add table public.pin_comments;
  end if;
end $$;
