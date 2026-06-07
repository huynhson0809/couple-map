-- User consent history for Terms and Privacy acceptance.
-- Run after the base schema.

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('signup', 'existing_user_gate')),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_accepted
  on public.user_consents(user_id, accepted_at desc);

alter table public.user_consents enable row level security;

create or replace function public.set_user_consent_server_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.accepted_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_consent_server_timestamp
  on public.user_consents;
create trigger set_user_consent_server_timestamp
  before insert on public.user_consents
  for each row execute function public.set_user_consent_server_timestamp();

drop policy if exists "Users can read own consent rows"
  on public.user_consents;
create policy "Users can read own consent rows"
  on public.user_consents
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own consent rows"
  on public.user_consents;
create policy "Users can insert own consent rows"
  on public.user_consents
  for insert
  with check (
    user_id = auth.uid()
    and source = 'existing_user_gate'
    and terms_version = '2026-06-07'
    and privacy_version = '2026-06-07'
  );

create or replace function handle_new_user()
returns trigger as $$
declare
  consent jsonb := coalesce(new.raw_user_meta_data->'consent', '{}'::jsonb);
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  if consent->>'terms_version' = '2026-06-07'
    and consent->>'privacy_version' = '2026-06-07'
    and consent->>'source' = 'signup'
  then
    insert into public.user_consents (
      user_id,
      terms_version,
      privacy_version,
      source
    )
    values (
      new.id,
      consent->>'terms_version',
      consent->>'privacy_version',
      'signup'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
