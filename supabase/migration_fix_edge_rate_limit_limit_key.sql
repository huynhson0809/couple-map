-- Hotfix: avoid PL/pgSQL ambiguity between check_edge_rate_limit.limit_key
-- and public.edge_rate_limits.limit_key.
create or replace function public.check_edge_rate_limit(
  limit_key text,
  window_seconds integer,
  max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_key alias for $1;
  v_window_seconds alias for $2;
  v_max_requests alias for $3;
  bucket_start timestamptz;
  current_count integer;
begin
  if v_limit_key is null or length(trim(v_limit_key)) = 0 then
    return false;
  end if;
  if v_window_seconds <= 0 or v_max_requests <= 0 then
    return false;
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds
  );

  delete from public.edge_rate_limits erl
  where erl.window_start < now() - make_interval(secs => v_window_seconds * 4);

  insert into public.edge_rate_limits (limit_key, window_start, count)
  values (v_limit_key, bucket_start, 1)
  on conflict on constraint edge_rate_limits_pkey
  do update set
    count = public.edge_rate_limits.count + 1,
    updated_at = now()
  returning count into current_count;

  return current_count <= v_max_requests;
end;
$$;

revoke all on function public.check_edge_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_edge_rate_limit(text, integer, integer)
  to service_role;
