-- Structured, localized in-app notifications and timezone-aware nudges.
-- Run after migration_notifications.sql, migration_streak_nudge.sql,
-- migration_memory_spaces.sql, and migration_user_locale_timezone_reminders.sql.

create or replace function public.notification_action_title(
  p_recipient_id uuid,
  p_actor_name text,
  p_action text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_locale text;
  v_actor_name text;
begin
  select case when locale = 'vi' then 'vi' else 'en' end
    into v_locale
    from public.users
    where id = p_recipient_id;
  v_locale := coalesce(v_locale, 'en');
  v_actor_name := coalesce(
    nullif(btrim(p_actor_name), ''),
    case when v_locale = 'vi' then 'Một thành viên' else 'A map member' end
  );

  if v_locale = 'vi' then
    return v_actor_name || case p_action
      when 'new_pin' then ' đã thêm một kỷ niệm mới'
      when 'reaction' then ' đã bày tỏ cảm xúc'
      when 'favorite' then ' đã đánh dấu yêu thích kỷ niệm của bạn'
      when 'comment' then ' đã bình luận'
      when 'comment_reply' then ' đã trả lời bình luận của bạn'
      when 'comment_reaction' then ' đã bày tỏ cảm xúc với bình luận của bạn'
      else ' đã gửi một thông báo'
    end;
  end if;

  return v_actor_name || case p_action
    when 'new_pin' then ' added a new memory'
    when 'reaction' then ' reacted'
    when 'favorite' then ' favorited your memory'
    when 'comment' then ' commented'
    when 'comment_reply' then ' replied to your comment'
    when 'comment_reaction' then ' reacted to your comment'
    else ' sent a notification'
  end;
end;
$$;

create or replace function public.notify_partner_new_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple record;
  v_partner_id uuid;
  v_creator_name text;
begin
  select * into v_couple from public.couples where id = new.couple_id;
  if v_couple is null then return new; end if;

  if new.created_by = v_couple.user_a then
    v_partner_id := v_couple.user_b;
  else
    v_partner_id := v_couple.user_a;
  end if;

  if v_partner_id is null then return new; end if;
  if not public.notification_preference_enabled(v_partner_id, 'memory_added') then
    return new;
  end if;

  select display_name into v_creator_name
    from public.users where id = new.created_by;

  insert into public.notifications (
    user_id, couple_id, space_id, type, title, body, data
  )
  values (
    v_partner_id,
    new.couple_id,
    new.space_id,
    'new_pin',
    public.notification_action_title(v_partner_id, v_creator_name, 'new_pin'),
    new.title,
    jsonb_build_object(
      'pin_id', new.id,
      'actor_name', v_creator_name,
      'action', 'new_pin'
    )
  );

  return new;
end;
$$;

create or replace function public.notify_pin_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin record;
  v_reactor_name text;
begin
  select * into v_pin from public.pins where id = new.pin_id;
  if v_pin is null then return new; end if;
  if v_pin.created_by = new.user_id then return new; end if;
  if not public.notification_preference_enabled(v_pin.created_by, 'reactions') then
    return new;
  end if;

  select display_name into v_reactor_name
    from public.users where id = new.user_id;

  insert into public.notifications (
    user_id, couple_id, space_id, type, title, body, data
  )
  values (
    v_pin.created_by,
    v_pin.couple_id,
    v_pin.space_id,
    'reaction',
    public.notification_action_title(v_pin.created_by, v_reactor_name, 'reaction'),
    v_pin.title,
    jsonb_build_object(
      'pin_id', new.pin_id,
      'reaction', new.reaction,
      'actor_name', v_reactor_name,
      'action', 'reaction'
    )
  );

  return new;
end;
$$;

create or replace function public.notify_pin_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
begin
  if new.is_favorite is distinct from true
    or old.is_favorite is distinct from false
  then
    return new;
  end if;

  v_actor_id := auth.uid();
  if v_actor_id is null or v_actor_id = new.created_by then return new; end if;
  if not public.notification_preference_enabled(new.created_by, 'reactions') then
    return new;
  end if;

  select display_name into v_actor_name
    from public.users where id = v_actor_id;

  insert into public.notifications (
    user_id, couple_id, space_id, type, title, body, data
  )
  values (
    new.created_by,
    new.couple_id,
    new.space_id,
    'reaction',
    public.notification_action_title(new.created_by, v_actor_name, 'favorite'),
    new.title,
    jsonb_build_object(
      'pin_id', new.id,
      'actor_name', v_actor_name,
      'action', 'favorite'
    )
  );

  return new;
end;
$$;

create or replace function public.notify_pin_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin record;
  v_commenter_name text;
  v_parent_comment record;
  v_recipient_id uuid;
begin
  select * into v_pin from public.pins where id = new.pin_id;
  if v_pin is null then return new; end if;

  select display_name into v_commenter_name
    from public.users where id = new.user_id;

  if new.parent_comment_id is not null then
    select * into v_parent_comment
      from public.pin_comments where id = new.parent_comment_id;

    if v_parent_comment is not null
      and v_parent_comment.user_id != new.user_id
    then
      v_recipient_id := v_parent_comment.user_id;

      if public.notification_preference_enabled(v_recipient_id, 'comments') then
        insert into public.notifications (
          user_id, couple_id, space_id, type, title, body, data
        )
        values (
          v_recipient_id,
          v_pin.couple_id,
          v_pin.space_id,
          'comment',
          public.notification_action_title(
            v_recipient_id,
            v_commenter_name,
            'comment_reply'
          ),
          left(new.body, 100),
          jsonb_build_object(
            'pin_id', new.pin_id,
            'comment_id', new.id,
            'parent_comment_id', new.parent_comment_id,
            'actor_name', v_commenter_name,
            'action', 'comment_reply'
          )
        );
      end if;
    end if;

    if v_pin.created_by != new.user_id
      and (v_parent_comment is null or v_pin.created_by != v_parent_comment.user_id)
      and public.notification_preference_enabled(v_pin.created_by, 'comments')
    then
      insert into public.notifications (
        user_id, couple_id, space_id, type, title, body, data
      )
      values (
        v_pin.created_by,
        v_pin.couple_id,
        v_pin.space_id,
        'comment',
        public.notification_action_title(
          v_pin.created_by,
          v_commenter_name,
          'comment'
        ),
        left(new.body, 100),
        jsonb_build_object(
          'pin_id', new.pin_id,
          'comment_id', new.id,
          'actor_name', v_commenter_name,
          'action', 'comment'
        )
      );
    end if;
  else
    if v_pin.created_by = new.user_id then return new; end if;
    if not public.notification_preference_enabled(v_pin.created_by, 'comments') then
      return new;
    end if;

    insert into public.notifications (
      user_id, couple_id, space_id, type, title, body, data
    )
    values (
      v_pin.created_by,
      v_pin.couple_id,
      v_pin.space_id,
      'comment',
      public.notification_action_title(
        v_pin.created_by,
        v_commenter_name,
        'comment'
      ),
      left(new.body, 100),
      jsonb_build_object(
        'pin_id', new.pin_id,
        'comment_id', new.id,
        'actor_name', v_commenter_name,
        'action', 'comment'
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_comment_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment record;
  v_pin record;
  v_reactor_name text;
begin
  select * into v_comment
    from public.pin_comments where id = new.comment_id;
  if v_comment is null then return new; end if;
  if v_comment.user_id = new.user_id then return new; end if;
  if not public.notification_preference_enabled(v_comment.user_id, 'reactions') then
    return new;
  end if;

  select * into v_pin from public.pins where id = v_comment.pin_id;
  if v_pin is null then return new; end if;

  select display_name into v_reactor_name
    from public.users where id = new.user_id;

  insert into public.notifications (
    user_id, couple_id, space_id, type, title, body, data
  )
  values (
    v_comment.user_id,
    v_pin.couple_id,
    v_pin.space_id,
    'reaction',
    public.notification_action_title(
      v_comment.user_id,
      v_reactor_name,
      'comment_reaction'
    ),
    left(v_comment.body, 100),
    jsonb_build_object(
      'pin_id', v_comment.pin_id,
      'comment_id', new.comment_id,
      'reaction', new.reaction,
      'actor_name', v_reactor_name,
      'action', 'comment_reaction'
    )
  );

  return new;
end;
$$;

create or replace function public.can_nudge_today(p_couple_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
begin
  select timezone into v_timezone
    from public.users
    where id = auth.uid();

  if v_timezone is null
    or not exists (select 1 from pg_timezone_names where name = v_timezone)
  then
    v_timezone := 'UTC';
  end if;
  v_today := (now() at time zone v_timezone)::date;

  return not exists (
    select 1
    from public.streak_nudge_logs
    where couple_id = p_couple_id
      and sender_id = auth.uid()
      and nudge_date = v_today
  );
end;
$$;
