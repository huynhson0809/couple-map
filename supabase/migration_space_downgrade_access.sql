-- Space downgrade access and account-wide notification inbox.
-- Run after migration_polar_billing.sql, migration_memory_spaces.sql,
-- migration_notifications.sql, and migration_support_admin.sql.

create table if not exists public.account_space_quota_states (
  user_id uuid primary key references public.users(id) on delete cascade,
  owned_space_limit integer not null check (owned_space_limit between 1 and 5),
  grace_started_at timestamptz not null,
  grace_ends_at timestamptz not null,
  selected_space_ids uuid[] not null default '{}'::uuid[],
  resolved_at timestamptz,
  warning_notification_sent_at timestamptz,
  restriction_notification_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_space_quota_states enable row level security;

drop policy if exists "Users can read own space quota state"
  on public.account_space_quota_states;
create policy "Users can read own space quota state"
  on public.account_space_quota_states for select
  using (user_id = auth.uid());

create or replace function public.sync_account_space_quota_state(
  p_user_id uuid,
  p_preferred_space_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit integer;
  v_count integer;
  v_owned_ids uuid[] := '{}'::uuid[];
  v_selected_ids uuid[] := '{}'::uuid[];
  v_restricted_ids uuid[] := '{}'::uuid[];
  v_candidate uuid;
  v_state public.account_space_quota_states%rowtype;
  v_had_state boolean := false;
  v_grace_active boolean := false;
  v_current_space_writable boolean := true;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'over_limit', false,
      'owned_space_limit', 1,
      'owned_space_count', 0,
      'grace_active', false,
      'grace_started_at', null,
      'grace_ends_at', null,
      'selected_space_ids', '[]'::jsonb,
      'restricted_space_ids', '[]'::jsonb,
      'resolved', false,
      'current_space_writable', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 71931));

  v_limit := public.get_owned_space_limit(p_user_id);

  select
    count(*)::integer,
    coalesce(array_agg(s.id order by s.created_at, s.id), '{}'::uuid[])
    into v_count, v_owned_ids
  from public.spaces s
  where s.owner_id = p_user_id;

  select *
    into v_state
  from public.account_space_quota_states q
  where q.user_id = p_user_id
  for update;
  v_had_state := found;

  if v_count <= v_limit then
    if v_had_state then
      delete from public.account_space_quota_states
      where user_id = p_user_id;

      insert into public.notifications (
        user_id,
        couple_id,
        space_id,
        type,
        title,
        body,
        data
      )
      values (
        p_user_id,
        null,
        null,
        'space_quota_restored',
        'Your maps are editable again',
        null,
        jsonb_build_object(
          'owned_space_limit', v_limit,
          'owned_space_count', v_count
        )
      );
    end if;

    return jsonb_build_object(
      'over_limit', false,
      'owned_space_limit', v_limit,
      'owned_space_count', v_count,
      'grace_active', false,
      'grace_started_at', null,
      'grace_ends_at', null,
      'selected_space_ids', '[]'::jsonb,
      'restricted_space_ids', '[]'::jsonb,
      'resolved', false,
      'current_space_writable', true
    );
  end if;

  if not v_had_state then
    insert into public.account_space_quota_states (
      user_id,
      owned_space_limit,
      grace_started_at,
      grace_ends_at
    )
    values (
      p_user_id,
      v_limit,
      v_now,
      v_now + interval '7 days'
    )
    returning * into v_state;
  elsif v_state.owned_space_limit > v_limit then
    -- A stricter downgrade starts a fresh grace window.
    update public.account_space_quota_states
    set
      owned_space_limit = v_limit,
      grace_started_at = v_now,
      grace_ends_at = v_now + interval '7 days',
      resolved_at = null,
      warning_notification_sent_at = null,
      restriction_notification_sent_at = null,
      updated_at = v_now
    where user_id = p_user_id
    returning * into v_state;
  elsif v_state.owned_space_limit <> v_limit then
    -- A partial upgrade immediately expands the editable selection.
    update public.account_space_quota_states
    set
      owned_space_limit = v_limit,
      updated_at = v_now
    where user_id = p_user_id
    returning * into v_state;
  end if;

  if v_state.warning_notification_sent_at is null then
    insert into public.notifications (
      user_id,
      couple_id,
      space_id,
      type,
      title,
      body,
      data
    )
    values (
      p_user_id,
      null,
      null,
      'space_quota_warning',
      'Choose the maps you want to keep editable',
      null,
      jsonb_build_object(
        'owned_space_limit', v_limit,
        'owned_space_count', v_count,
        'grace_ends_at', v_state.grace_ends_at
      )
    );

    update public.account_space_quota_states
    set
      warning_notification_sent_at = v_now,
      updated_at = v_now
    where user_id = p_user_id
    returning * into v_state;
  end if;

  select coalesce(array_agg(chosen.id order by chosen.first_position), '{}'::uuid[])
    into v_selected_ids
  from (
    select selected.id, min(selected.position) as first_position
    from unnest(coalesce(v_state.selected_space_ids, '{}'::uuid[]))
      with ordinality as selected(id, position)
    where selected.id = any(v_owned_ids)
    group by selected.id
    order by min(selected.position)
    limit v_limit
  ) chosen;

  v_grace_active := v_now < v_state.grace_ends_at;

  if not v_grace_active then
    if p_preferred_space_id is not null
      and p_preferred_space_id = any(v_owned_ids)
      and not p_preferred_space_id = any(v_selected_ids)
      and cardinality(v_selected_ids) < v_limit then
      v_selected_ids := array_append(v_selected_ids, p_preferred_space_id);
    end if;

    foreach v_candidate in array v_owned_ids loop
      exit when cardinality(v_selected_ids) >= v_limit;
      if not v_candidate = any(v_selected_ids) then
        v_selected_ids := array_append(v_selected_ids, v_candidate);
      end if;
    end loop;

    select coalesce(array_agg(owned_id), '{}'::uuid[])
      into v_restricted_ids
    from unnest(v_owned_ids) as owned(owned_id)
    where not owned_id = any(v_selected_ids);

    update public.account_space_quota_states
    set
      selected_space_ids = v_selected_ids,
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
    where user_id = p_user_id
    returning * into v_state;

    if v_state.restriction_notification_sent_at is null then
      insert into public.notifications (
        user_id,
        couple_id,
        space_id,
        type,
        title,
        body,
        data
      )
      values (
        p_user_id,
        null,
        null,
        'space_quota_restricted',
        'Some maps are now read-only',
        null,
        jsonb_build_object(
          'owned_space_limit', v_limit,
          'owned_space_count', v_count,
          'selected_space_ids', to_jsonb(v_selected_ids),
          'restricted_space_ids', to_jsonb(v_restricted_ids)
        )
      );

      update public.account_space_quota_states
      set
        restriction_notification_sent_at = v_now,
        updated_at = v_now
      where user_id = p_user_id
      returning * into v_state;
    end if;
  else
    update public.account_space_quota_states
    set
      selected_space_ids = v_selected_ids,
      updated_at = v_now
    where user_id = p_user_id
    returning * into v_state;
  end if;

  if p_preferred_space_id is not null
    and p_preferred_space_id = any(v_owned_ids)
    and not v_grace_active then
    v_current_space_writable := p_preferred_space_id = any(v_selected_ids);
  end if;

  return jsonb_build_object(
    'over_limit', true,
    'owned_space_limit', v_limit,
    'owned_space_count', v_count,
    'grace_active', v_grace_active,
    'grace_started_at', v_state.grace_started_at,
    'grace_ends_at', v_state.grace_ends_at,
    'selected_space_ids', to_jsonb(v_selected_ids),
    'restricted_space_ids', to_jsonb(v_restricted_ids),
    'resolved', not v_grace_active,
    'current_space_writable', v_current_space_writable
  );
end;
$$;

revoke all on function public.sync_account_space_quota_state(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.is_space_writable(p_space_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_context jsonb;
begin
  select owner_id into v_owner_id
  from public.spaces
  where id = p_space_id;

  -- A missing parent only occurs during a cascading cleanup.
  if v_owner_id is null then
    return true;
  end if;

  v_context := public.sync_account_space_quota_state(
    v_owner_id,
    p_space_id
  );

  return coalesce((v_context ->> 'current_space_writable')::boolean, true);
end;
$$;

revoke all on function public.is_space_writable(uuid)
  from public, anon, authenticated;
grant execute on function public.is_space_writable(uuid)
  to service_role;

create or replace function public.set_owned_space_quota_selection(
  p_space_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_context jsonb;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_limit integer;
  v_matching_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 71931));
  v_context := public.sync_account_space_quota_state(v_user_id, null);

  if not coalesce((v_context ->> 'over_limit')::boolean, false) then
    return v_context;
  end if;

  if not coalesce((v_context ->> 'grace_active')::boolean, false) then
    raise exception 'Space selection is locked after the grace period'
      using errcode = 'PSQ03';
  end if;

  v_limit := (v_context ->> 'owned_space_limit')::integer;

  select coalesce(array_agg(candidate.id order by candidate.id), '{}'::uuid[])
    into v_selected_ids
  from (
    select distinct selected.id
    from unnest(coalesce(p_space_ids, '{}'::uuid[])) as selected(id)
    where selected.id is not null
  ) candidate;

  if cardinality(v_selected_ids) <> v_limit then
    raise exception 'Select exactly % owned space(s)', v_limit
      using errcode = 'PSQ02';
  end if;

  select count(*)::integer
    into v_matching_count
  from public.spaces s
  where s.owner_id = v_user_id
    and s.id = any(v_selected_ids);

  if v_matching_count <> cardinality(v_selected_ids) then
    raise exception 'Selection contains a space you do not own'
      using errcode = 'PSQ02';
  end if;

  update public.account_space_quota_states
  set
    selected_space_ids = v_selected_ids,
    updated_at = now()
  where user_id = v_user_id;

  return public.sync_account_space_quota_state(v_user_id, null);
end;
$$;

revoke all on function public.set_owned_space_quota_selection(uuid[])
  from public, anon;
grant execute on function public.set_owned_space_quota_selection(uuid[])
  to authenticated;

create or replace function public.get_subscription_context_for_space(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_space public.spaces;
  v_account_plan text;
  v_space_plan text;
  v_owned_count integer;
  v_owned_limit integer;
  v_quota_context jsonb;
  v_current_space_writable boolean := true;
begin
  if v_viewer is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select *
    into v_space
  from public.spaces
  where id = p_space_id;

  if v_space.id is null then
    v_quota_context := public.sync_account_space_quota_state(v_viewer, null);
    return jsonb_build_object(
      'account_plan', public.get_account_plan(v_viewer),
      'space_plan', 'free',
      'space_plan_period_end', null,
      'space_owner_id', null,
      'owned_space_count', public.get_owned_space_count(v_viewer),
      'owned_space_limit', public.get_owned_space_limit(v_viewer),
      'can_create_space', public.can_create_owned_space(v_viewer),
      'subscription', public.get_active_account_subscription(v_viewer),
      'limits', public.get_plan_limits('free'),
      'space_quota', v_quota_context,
      'current_space_writable', true
    );
  end if;

  if not public.is_space_member(p_space_id) then
    raise exception 'Not a space member' using errcode = 'P0002';
  end if;

  v_account_plan := public.get_account_plan(v_viewer);
  v_space_plan := public.get_account_plan(v_space.owner_id);
  v_owned_count := public.get_owned_space_count(v_viewer);
  v_owned_limit := public.get_owned_space_limit(v_viewer);
  v_quota_context := public.sync_account_space_quota_state(
    v_viewer,
    case when v_space.owner_id = v_viewer then p_space_id else null end
  );
  v_current_space_writable := public.is_space_writable(p_space_id);

  return jsonb_build_object(
    'account_plan', v_account_plan,
    'space_plan', v_space_plan,
    'space_plan_period_end',
      public.get_active_account_subscription(v_space.owner_id)
        ->> 'current_period_end',
    'space_owner_id', v_space.owner_id,
    'owned_space_count', v_owned_count,
    'owned_space_limit', v_owned_limit,
    'can_create_space', v_owned_count < v_owned_limit,
    'subscription', public.get_active_account_subscription(v_viewer),
    'limits', public.get_plan_limits(v_space_plan),
    'space_quota', v_quota_context,
    'current_space_writable', v_current_space_writable
  );
end;
$$;

create or replace function public.get_subscription_context_for_couple(
  p_couple_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_subscription_context_for_space(p_couple_id);
$$;

revoke all on function public.get_subscription_context_for_space(uuid)
  from public, anon;
grant execute on function public.get_subscription_context_for_space(uuid)
  to authenticated;

revoke all on function public.get_subscription_context_for_couple(uuid)
  from public, anon;
grant execute on function public.get_subscription_context_for_couple(uuid)
  to authenticated;

create or replace function public.enforce_space_write_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_space_id uuid;
  v_pin_id uuid;
  v_comment_id uuid;
  v_collection_id uuid;
begin
  -- Owners must always be able to delete an extra map and return under quota.
  if tg_table_name = 'spaces' and tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'spaces' then
    v_space_id := nullif(v_row ->> 'id', '')::uuid;
  elsif tg_table_name in (
    'pins',
    'pin_categories',
    'collections',
    'bucket_list',
    'custom_categories'
  ) then
    v_space_id := coalesce(
      nullif(v_row ->> 'space_id', '')::uuid,
      nullif(v_row ->> 'couple_id', '')::uuid
    );
  elsif tg_table_name in ('pin_images', 'pin_reactions', 'pin_comments') then
    v_pin_id := nullif(v_row ->> 'pin_id', '')::uuid;
    select coalesce(p.space_id, p.couple_id)
      into v_space_id
    from public.pins p
    where p.id = v_pin_id;
  elsif tg_table_name = 'pin_comment_reactions' then
    v_comment_id := nullif(v_row ->> 'comment_id', '')::uuid;
    select coalesce(p.space_id, p.couple_id)
      into v_space_id
    from public.pin_comments pc
    join public.pins p on p.id = pc.pin_id
    where pc.id = v_comment_id;
  elsif tg_table_name = 'pin_collections' then
    v_pin_id := nullif(v_row ->> 'pin_id', '')::uuid;
    v_collection_id := nullif(v_row ->> 'collection_id', '')::uuid;
    select coalesce(p.space_id, p.couple_id)
      into v_space_id
    from public.pins p
    where p.id = v_pin_id;

    if v_space_id is null then
      select coalesce(c.space_id, c.couple_id)
        into v_space_id
      from public.collections c
      where c.id = v_collection_id;
    end if;
  end if;

  -- delete_space_for_current_user clears this one reference before cascading.
  if tg_table_name = 'bucket_list'
    and tg_op = 'UPDATE'
    and current_setting('pinly.allow_membership_mutation', true) = 'on'
    and (to_jsonb(new) - 'completed_pin_id') = (to_jsonb(old) - 'completed_pin_id') then
    return new;
  end if;

  -- Compatibility helpers may attach a legacy couple id while opening a map.
  -- Invite promotion changes other fields and is intentionally not bypassed.
  if tg_table_name = 'spaces'
    and tg_op = 'UPDATE'
    and current_setting('pinly.allow_membership_mutation', true) = 'on'
    and (to_jsonb(new) - 'legacy_couple_id' - 'updated_at')
      = (to_jsonb(old) - 'legacy_couple_id' - 'updated_at') then
    return new;
  end if;

  if v_space_id is not null
    and not public.is_space_writable(v_space_id) then
    raise exception 'This map is read-only because its owner is over the current plan limit'
      using errcode = 'PSQ01';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'spaces',
    'pins',
    'pin_categories',
    'pin_images',
    'collections',
    'pin_collections',
    'bucket_list',
    'custom_categories',
    'pin_reactions',
    'pin_comments',
    'pin_comment_reactions'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'drop trigger if exists enforce_space_write_access_%I on public.%I',
        v_table,
        v_table
      );
      execute format(
        'create trigger enforce_space_write_access_%I before insert or update or delete on public.%I for each row execute function public.enforce_space_write_access()',
        v_table,
        v_table
      );
    end if;
  end loop;
end;
$$;

-- The inbox is account-wide. Space context is returned so the client can label
-- each notification and switch spaces before opening its destination.
create or replace function public.get_notification_feed(
  p_limit integer default 30,
  p_offset integer default 0,
  p_space_id uuid default null
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
  visible as (
    select
      n.id,
      n.user_id,
      n.couple_id,
      mapped_space.id as space_id,
      mapped_space.name as space_name,
      n.type,
      n.title,
      n.body,
      n.data,
      n.read,
      n.created_at
    from public.notifications n
    left join lateral (
      select s.id, s.name
      from public.spaces s
      join public.space_members sm on sm.space_id = s.id
      where sm.user_id = auth.uid()
        and sm.status = 'active'
        and (
          s.id = n.space_id
          or (
            n.space_id is null
            and n.couple_id in (s.id, s.legacy_couple_id)
          )
        )
      order by case when s.id = n.space_id then 0 else 1 end
      limit 1
    ) mapped_space on true
    where auth.uid() is not null
      and n.user_id = auth.uid()
      and (
        (n.space_id is null and n.couple_id is null)
        or mapped_space.id is not null
      )
  ),
  page as (
    select *
    from visible
    order by created_at desc
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
    coalesce((select count(*) from visible where read = false), 0)
  );
$$;

revoke all on function public.get_notification_feed(integer, integer, uuid)
  from public, anon;
grant execute on function public.get_notification_feed(integer, integer, uuid)
  to authenticated;

create index if not exists idx_account_space_quota_grace_end
  on public.account_space_quota_states(grace_ends_at);
