-- Admin 2.0: server authority independent of public profile flags.
create table if not exists private.admin_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'operator' check (role in ('owner', 'operator', 'auditor')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  grant_reason text not null,
  check (length(btrim(grant_reason)) >= 10)
);

alter table private.admin_operators enable row level security;
revoke all on private.admin_operators from public, anon, authenticated;

-- One-time migration of existing operators. Future grants are made by reviewed SQL only.
insert into private.admin_operators(user_id, role, grant_reason)
select p.id, 'owner', 'Admin 2.0 migration of pre-existing administrator'
from public.user_profiles p
join auth.users u on u.id = p.id
where p.is_admin is true
on conflict (user_id) do nothing;

create or replace function private.admin_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.admin_operators o
    where o.user_id = auth.uid() and o.revoked_at is null
  );
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.admin_member()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function private.check_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_admin(); $$;

revoke all on function private.admin_member(), private.is_admin(), private.check_is_admin()
  from public, anon, authenticated;
-- RLS policies call private.is_admin() under the request role. It returns only
-- a boolean and must stay executable while the underlying membership stays private.
grant execute on function private.is_admin() to anon, authenticated;

-- A non-privileged, own-session status is enough to render TOTP enrollment.
create or replace function public.admin_access_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'eligible', private.admin_member(),
    'authorized', private.is_admin(),
    'mfa_required', private.admin_member() and not private.is_admin()
  );
$$;
revoke all on function public.admin_access_status() from public, anon, authenticated;
grant execute on function public.admin_access_status() to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_admin(); $$;

create or replace function public.check_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_admin(); $$;

-- Existing private implementations remain callable only from guarded wrappers.
revoke all on function private.get_admin_dashboard_stats(),
  private.get_nutritionists_list(), private.get_system_live_logs(integer),
  private.get_tcc_study_metrics() from public, anon, authenticated;

create or replace function public.get_admin_dashboard_stats()
returns json language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_admin_dashboard_stats();
end;
$$;

create or replace function public.get_nutritionists_list()
returns table(id uuid, name text, email text, created_at timestamptz,
  is_active boolean, patients_count bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return query select * from private.get_nutritionists_list();
end;
$$;

create or replace function public.get_system_live_logs(limit_count integer default 50)
returns table(id text, type text, message text, user_name text, event_timestamp timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return query select * from private.get_system_live_logs(least(greatest(limit_count, 1), 100));
end;
$$;

create or replace function public.get_tcc_study_metrics()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_tcc_study_metrics();
end;
$$;

create or replace function public.get_nutritionist_detail(p_nutritionist_id uuid)
returns json language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_nutritionist_detail(p_nutritionist_id);
end;
$$;

revoke all on function public.get_admin_dashboard_stats(), public.get_nutritionists_list(),
  public.get_system_live_logs(integer), public.get_tcc_study_metrics(),
  public.get_nutritionist_detail(uuid), public.check_is_admin(), public.is_admin()
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats(), public.get_nutritionists_list(),
  public.get_system_live_logs(integer), public.get_tcc_study_metrics(),
  public.get_nutritionist_detail(uuid), public.check_is_admin(), public.is_admin()
  to authenticated;

-- Existing verification and privacy RPCs use private.is_admin() and inherit MFA.
