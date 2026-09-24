-- One atomic, bounded counter per authenticated user. Only the Edge Function's
-- service role may call this RPC; clients cannot choose another user's quota.
create table if not exists private.food_proxy_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

revoke all on private.food_proxy_quotas from public, anon, authenticated;

create or replace function public.claim_food_proxy_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  insert into private.food_proxy_quotas as quota
    (user_id, window_started_at, request_count)
  values (p_user_id, clock_timestamp(), 1)
  on conflict (user_id) do update
    set window_started_at = case
      when quota.window_started_at <= clock_timestamp() - interval '1 minute'
        then clock_timestamp() else quota.window_started_at end,
      request_count = case
        when quota.window_started_at <= clock_timestamp() - interval '1 minute'
          then 1 else quota.request_count + 1 end
  returning request_count <= 20 into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.claim_food_proxy_quota(uuid) from public, anon, authenticated;
grant execute on function public.claim_food_proxy_quota(uuid) to service_role;
