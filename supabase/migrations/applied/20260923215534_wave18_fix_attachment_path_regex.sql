-- PostgreSQL standard-conforming strings treat the former backslash literally.
-- A bracketed dot matches exactly one filename extension separator.
create or replace function private.can_access_anamnesis_attachment_object(
  p_name text, p_write boolean default false
) returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_parts text[] := string_to_array(p_name,'/');
  v_record public.anamnesis_records%rowtype;
begin
  if p_name !~ '^(public|nutritionist)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.](jpg|jpeg|png|webp|pdf)$'
     or array_length(v_parts,1)<>4 then return false; end if;
  if v_parts[1]='public' then
    if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then return false; end if;
    select * into v_record from public.anamnesis_records where id=v_parts[3]::uuid;
    if not found then return false; end if;
    if not p_write and auth.uid()=v_record.nutritionist_id then return true; end if;
    return v_record.public_access_token=v_parts[2]::uuid
      and (v_record.token_expires_at is null or v_record.token_expires_at>=now())
      and v_record.status not in ('submitted','completed','validated');
  end if;
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  select * into v_record from public.anamnesis_records where id=v_parts[3]::uuid;
  return found and auth.uid()=v_record.nutritionist_id
    and auth.uid()=v_parts[2]::uuid
    and (not p_write or v_record.status='draft');
end;
$function$;
