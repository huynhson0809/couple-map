-- Streak nudge: allow one user to send a gentle reminder to their partner.
-- Anti-spam: max 1 nudge per user per calendar day (VN time).

create table if not exists public.streak_nudge_logs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  nudge_date date not null,
  created_at timestamptz default now(),
  unique (couple_id, sender_id, nudge_date)
);

create index if not exists idx_streak_nudge_logs_lookup
  on public.streak_nudge_logs(couple_id, sender_id, nudge_date);

alter table public.streak_nudge_logs enable row level security;

drop policy if exists "Users can read own couple nudge logs"
  on public.streak_nudge_logs;

create policy "Users can read own couple nudge logs"
  on public.streak_nudge_logs for select
  using (couple_id = get_my_couple_id());

drop policy if exists "Users can insert nudge for own couple"
  on public.streak_nudge_logs;

create policy "Users can insert nudge for own couple"
  on public.streak_nudge_logs for insert
  with check (
    couple_id = get_my_couple_id()
    and sender_id = auth.uid()
  );

-- RPC to check if user already nudged today (VN time)
create or replace function public.can_nudge_today(p_couple_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_exists boolean;
begin
  select exists(
    select 1 from public.streak_nudge_logs
    where couple_id = p_couple_id
      and sender_id = auth.uid()
      and nudge_date = v_today
  ) into v_exists;

  return not v_exists;
end;
$$;
