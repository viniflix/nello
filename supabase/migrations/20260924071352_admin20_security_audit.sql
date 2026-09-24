-- Coarse access audit: no IP, token, factor secret or clinical payload.
create table if not exists private.admin_access_events (
  operator_id uuid not null references private.admin_operators(user_id),
  hour_bucket timestamptz not null,
  outcome text not null check (outcome in ('authorized', 'mfa_required')),
  attempts integer not null default 1 check (attempts > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (operator_id, hour_bucket, outcome)
);
alter table private.admin_access_events enable row level security;
revoke all on private.admin_access_events from public, anon, authenticated;

create or replace function public.admin_access_status()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  member boolean := private.admin_member();
  allowed boolean := private.is_admin();
begin
  if member then
    insert into private.admin_access_events(operator_id, hour_bucket, outcome)
    values (auth.uid(), date_trunc('hour', now()), case when allowed then 'authorized' else 'mfa_required' end)
    on conflict (operator_id, hour_bucket, outcome)
    do update set attempts = private.admin_access_events.attempts + 1, last_seen_at = now();
  end if;
  return jsonb_build_object('eligible', member, 'authorized', allowed, 'mfa_required', member and not allowed);
end;
$$;
revoke all on function public.admin_access_status() from public, anon, authenticated;
grant execute on function public.admin_access_status() to authenticated;

create or replace function public.admin_security_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', o.user_id,
        'email', u.email,
        'role', o.role,
        'granted_at', o.granted_at,
        'revoked_at', o.revoked_at,
        'mfa_verified', exists (select 1 from auth.mfa_factors f where f.user_id = o.user_id and f.status::text = 'verified'),
        'last_mfa_challenge_at', (select max(f.last_challenged_at) from auth.mfa_factors f where f.user_id = o.user_id and f.status::text = 'verified')
      ) order by o.granted_at)
      from private.admin_operators o join auth.users u on u.id = o.user_id
    ), '[]'::jsonb),
    'access_last_7d', coalesce((
      select jsonb_agg(jsonb_build_object('hour', e.hour_bucket, 'outcome', e.outcome, 'attempts', e.attempts, 'operator_id', e.operator_id) order by e.hour_bucket desc)
      from (select * from private.admin_access_events where hour_bucket >= now() - interval '7 days' order by hour_bucket desc limit 200) e
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_security_overview() from public, anon, authenticated;
grant execute on function public.admin_security_overview() to authenticated;
