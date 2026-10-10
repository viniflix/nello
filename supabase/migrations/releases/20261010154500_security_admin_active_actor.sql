begin;

-- A signed AAL2 session cannot retain administrative authority after the
-- account is deactivated. Shared by RPCs, policies and action-specific guards.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.admin_member()
    and private.wave05_active_actor()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- CREATE OR REPLACE retains the existing owner and reviewed execute grants.
-- No operator, factor, account or clinical row is changed by this migration.
commit;
