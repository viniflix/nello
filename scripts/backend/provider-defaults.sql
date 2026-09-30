-- CI ONLY. Invoked against the disposable runner DB, never the hosted database.
-- Match the captured absence of per-schema defaults for this provider-owned role.
-- Normal migration role stays unprivileged; no grant of membership/superuser.
DO $role_guard$ BEGIN
  IF current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'Provider defaults require the isolated provider role';
  END IF;
END $role_guard$;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM postgres,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM postgres,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM postgres,anon,authenticated,service_role;
