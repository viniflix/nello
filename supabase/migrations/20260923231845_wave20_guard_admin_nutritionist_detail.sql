-- This administrative RPC returns patient details. Require an authenticated admin
-- at the exposed entry point and remove direct access to its privileged helper.
create or replace function public.get_nutritionist_detail(p_nutritionist_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return private.get_nutritionist_detail(p_nutritionist_id);
end;
$$;

revoke execute on function public.get_nutritionist_detail(uuid) from public, anon;
grant execute on function public.get_nutritionist_detail(uuid) to authenticated, service_role;
revoke execute on function private.get_nutritionist_detail(uuid) from public, anon, authenticated;
grant execute on function private.get_nutritionist_detail(uuid) to service_role;
