-- A normal meal-plan editing burst may search and open many foods in one minute.
-- Cache hits are handled before this quota; this bounds new external lookups.
create or replace function public.claim_food_proxy_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
  quota_time timestamptz := statement_timestamp();
begin
  if p_user_id is null then return false; end if;

  insert into private.food_proxy_quotas as quota
    (user_id, window_started_at, request_count)
  values (p_user_id, quota_time, 1)
  on conflict (user_id) do update
    set window_started_at = case
      when quota.window_started_at <= quota_time - interval '1 minute'
        then quota_time else quota.window_started_at end,
      request_count = case
        when quota.window_started_at <= quota_time - interval '1 minute'
          then 1 else quota.request_count + 1 end
  returning request_count <= 60 into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.claim_food_proxy_quota(uuid) from public, anon, authenticated;
grant execute on function public.claim_food_proxy_quota(uuid) to service_role;
