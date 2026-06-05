-- In-app notifications feed
-- Types: new_pin, reaction, comment, streak_reminder, streak_complete, streak_broken

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb default '{}',
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications(user_id) where read = false;

create or replace function public.get_notification_feed(
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_limit, 30), 1), 50) as limit_value,
      greatest(coalesce(p_offset, 0), 0) as offset_value
  ),
  page as (
    select
      n.id,
      n.user_id,
      n.couple_id,
      n.type,
      n.title,
      n.body,
      n.data,
      n.read,
      n.created_at
    from public.notifications n
    where auth.uid() is not null
      and n.user_id = auth.uid()
    order by n.created_at desc
    limit (select limit_value from bounds)
    offset (select offset_value from bounds)
  )
  select jsonb_build_object(
    'notifications',
    coalesce(
      (select jsonb_agg(to_jsonb(page) order by page.created_at desc) from page),
      '[]'::jsonb
    ),
    'unreadCount',
    coalesce(
      (
        select count(*)
        from public.notifications n
        where auth.uid() is not null
          and n.user_id = auth.uid()
          and n.read = false
      ),
      0
    )
  );
$$;

revoke all on function public.get_notification_feed(integer, integer)
  from public, anon;
grant execute on function public.get_notification_feed(integer, integer)
  to authenticated;

-- RLS
alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications"
  on public.notifications;
create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications"
  on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert (from edge functions / triggers)
drop policy if exists "Service can insert notifications"
  on public.notifications;
create policy "Service can insert notifications"
  on public.notifications for insert
  with check (true);

-- Auto-create notification when a pin is created (notify partner)
create or replace function public.notify_partner_new_pin()
returns trigger as $$
declare
  v_couple record;
  v_partner_id uuid;
  v_creator_name text;
begin
  -- Get couple info
  select * into v_couple from public.couples where id = NEW.couple_id;
  if v_couple is null then return NEW; end if;

  -- Determine partner
  if NEW.created_by = v_couple.user_a then
    v_partner_id := v_couple.user_b;
  else
    v_partner_id := v_couple.user_a;
  end if;

  if v_partner_id is null then return NEW; end if;

  -- Get creator name
  select coalesce(display_name, 'Bạn ấy') into v_creator_name
    from public.users where id = NEW.created_by;

  insert into public.notifications (user_id, couple_id, type, title, body, data)
  values (
    v_partner_id,
    NEW.couple_id,
    'new_pin',
    v_creator_name || ' đã thêm một kỷ niệm mới',
    NEW.title,
    jsonb_build_object('pin_id', NEW.id)
  );

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_partner_new_pin on public.pins;
create trigger trg_notify_partner_new_pin
  after insert on public.pins
  for each row execute function public.notify_partner_new_pin();

-- Auto-create notification when a reaction is added
create or replace function public.notify_pin_reaction()
returns trigger as $$
declare
  v_pin record;
  v_reactor_name text;
begin
  select * into v_pin from public.pins where id = NEW.pin_id;
  if v_pin is null then return NEW; end if;
  -- Don't notify yourself
  if v_pin.created_by = NEW.user_id then return NEW; end if;

  select coalesce(display_name, 'Bạn ấy') into v_reactor_name
    from public.users where id = NEW.user_id;

  insert into public.notifications (user_id, couple_id, type, title, body, data)
  values (
    v_pin.created_by,
    v_pin.couple_id,
    'reaction',
    v_reactor_name || ' đã bày tỏ cảm xúc',
    v_pin.title,
    jsonb_build_object('pin_id', NEW.pin_id, 'reaction', NEW.reaction)
  );

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_pin_reaction on public.pin_reactions;
create trigger trg_notify_pin_reaction
  after insert on public.pin_reactions
  for each row execute function public.notify_pin_reaction();

-- Auto-create notification when a comment is added
create or replace function public.notify_pin_comment()
returns trigger as $$
declare
  v_pin record;
  v_commenter_name text;
begin
  select * into v_pin from public.pins where id = NEW.pin_id;
  if v_pin is null then return NEW; end if;
  -- Don't notify yourself
  if v_pin.created_by = NEW.user_id then return NEW; end if;

  select coalesce(display_name, 'Bạn ấy') into v_commenter_name
    from public.users where id = NEW.user_id;

  insert into public.notifications (user_id, couple_id, type, title, body, data)
  values (
    v_pin.created_by,
    v_pin.couple_id,
    'comment',
    v_commenter_name || ' đã bình luận',
    left(NEW.body, 100),
    jsonb_build_object('pin_id', NEW.pin_id, 'comment_id', NEW.id)
  );

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_pin_comment on public.pin_comments;
create trigger trg_notify_pin_comment
  after insert on public.pin_comments
  for each row execute function public.notify_pin_comment();

-- Enable realtime for notifications
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end;
$$;
