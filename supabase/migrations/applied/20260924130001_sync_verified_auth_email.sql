-- The Auth email becomes authoritative only after its confirmation flow completes.
-- Keep the public profile in sync without allowing the browser to write it early.
create or replace function private.sync_profile_email_from_auth()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.user_profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function private.sync_profile_email_from_auth();

revoke all on function private.sync_profile_email_from_auth() from public, anon, authenticated;
