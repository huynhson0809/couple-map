-- Replies and reactions for memory comments.

alter table public.pin_comments
  add column if not exists parent_comment_id uuid references public.pin_comments(id) on delete cascade;

create index if not exists idx_pin_comments_parent
  on public.pin_comments(parent_comment_id, created_at);

create table if not exists public.pin_comment_reactions (
  comment_id uuid references public.pin_comments(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  reaction text not null default 'love',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (comment_id, user_id)
);

alter table public.pin_comment_reactions
  add column if not exists updated_at timestamptz default now();
alter table public.pin_comment_reactions
  alter column updated_at set default now();
update public.pin_comment_reactions
  set updated_at = coalesce(updated_at, created_at, now())
  where updated_at is null;
alter table public.pin_comment_reactions
  alter column updated_at set not null;

alter table public.pin_comment_reactions
  drop constraint if exists pin_comment_reactions_reaction_check;
alter table public.pin_comment_reactions
  add constraint pin_comment_reactions_reaction_check
  check (reaction in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'));

create index if not exists idx_pin_comment_reactions_comment
  on public.pin_comment_reactions(comment_id);

alter table public.pin_comment_reactions enable row level security;

drop trigger if exists pin_comment_reactions_updated_at
  on public.pin_comment_reactions;
create trigger pin_comment_reactions_updated_at
  before update on public.pin_comment_reactions
  for each row execute function update_updated_at();

drop policy if exists "Couple members can read comment reactions"
  on public.pin_comment_reactions;
drop policy if exists "Couple members can react to comments"
  on public.pin_comment_reactions;
drop policy if exists "Couple members can update own comment reactions"
  on public.pin_comment_reactions;
drop policy if exists "Users can remove own comment reactions"
  on public.pin_comment_reactions;

create policy "Couple members can read comment reactions"
  on public.pin_comment_reactions for select
  using (
    comment_id in (
      select pc.id
      from public.pin_comments pc
      join public.pins p on p.id = pc.pin_id
      where p.couple_id = get_my_couple_id()
    )
  );

create policy "Couple members can react to comments"
  on public.pin_comment_reactions for insert
  with check (
    user_id = auth.uid()
    and comment_id in (
      select pc.id
      from public.pin_comments pc
      join public.pins p on p.id = pc.pin_id
      where p.couple_id = get_my_couple_id()
    )
  );

create policy "Couple members can update own comment reactions"
  on public.pin_comment_reactions for update
  using (
    user_id = auth.uid()
    and comment_id in (
      select pc.id
      from public.pin_comments pc
      join public.pins p on p.id = pc.pin_id
      where p.couple_id = get_my_couple_id()
    )
  )
  with check (
    user_id = auth.uid()
    and comment_id in (
      select pc.id
      from public.pin_comments pc
      join public.pins p on p.id = pc.pin_id
      where p.couple_id = get_my_couple_id()
    )
  );

create policy "Users can remove own comment reactions"
  on public.pin_comment_reactions for delete
  using (
    user_id = auth.uid()
    and comment_id in (
      select pc.id
      from public.pin_comments pc
      join public.pins p on p.id = pc.pin_id
      where p.couple_id = get_my_couple_id()
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pin_comment_reactions'
  ) then
    alter publication supabase_realtime add table public.pin_comment_reactions;
  end if;
end $$;
