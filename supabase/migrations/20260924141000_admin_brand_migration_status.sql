-- Operational check for remaining live records of the retired brand.
-- Historical reports and Auth audit events are deliberately not modified.
create or replace function public.admin_brand_migration_status()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'legacy_auth_accounts', (
      select count(*) from auth.users
      where split_part(lower(email), '@', 2) in ('hipozero.com', 'hipozero.com.br')
    ),
    'legacy_public_assets', (
      select count(*) from storage.objects o
      join storage.buckets b on b.id = o.bucket_id
      where b.public and o.name ilike '%hipozero%'
    ),
    'legacy_visible_achievements', (
      select count(*) from public.achievements
      where name ilike '%hipozero%' or description ilike '%hipozero%'
    ),
    'historical_reports', (
      select count(*) from public.bug_reports
      where user_email ilike '%hipozero%'
    )
  );
end;
$$;
revoke all on function public.admin_brand_migration_status() from public, anon, authenticated;
grant execute on function public.admin_brand_migration_status() to authenticated;
