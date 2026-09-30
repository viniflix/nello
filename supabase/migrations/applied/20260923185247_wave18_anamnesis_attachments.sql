insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('anamnesis-attachments','anamnesis-attachments',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_access_anamnesis_attachment_object(
  p_name text, p_write boolean default false
) returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_parts text[] := string_to_array(p_name,'/');
  v_record public.anamnesis_records%rowtype;
begin
  if p_name !~ '^(public|nutritionist)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|jpeg|png|webp|pdf)$'
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
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  select * into v_record from public.anamnesis_records where id=v_parts[3]::uuid;
  return found and auth.uid()=v_record.nutritionist_id
    and auth.uid()=v_parts[2]::uuid
    and (not p_write or v_record.status='draft');
end;
$function$;
revoke all on function private.can_access_anamnesis_attachment_object(text,boolean) from public;
grant execute on function private.can_access_anamnesis_attachment_object(text,boolean) to anon,authenticated;

create policy anamnesis_files_read on storage.objects for select to anon,authenticated
using (bucket_id='anamnesis-attachments'
  and private.can_access_anamnesis_attachment_object(name,false));
create policy anamnesis_files_insert on storage.objects for insert to anon,authenticated
with check (bucket_id='anamnesis-attachments'
  and private.can_access_anamnesis_attachment_object(name,true));
create policy anamnesis_files_delete on storage.objects for delete to anon,authenticated
using (bucket_id='anamnesis-attachments'
  and private.can_access_anamnesis_attachment_object(name,true));

create or replace function public.attach_anamnesis_file(
  p_record_id uuid,p_token uuid,p_path text,p_field_id text,
  p_field_label text,p_file_name text
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_record public.anamnesis_records%rowtype;
  v_object storage.objects%rowtype;
  v_sections jsonb;
  v_attachment jsonb;
  v_author text;
begin
  select * into v_record from public.anamnesis_records where id=p_record_id for update;
  if not found then raise exception 'ANAMNESIS_NOT_FOUND' using errcode='P0002'; end if;
  if auth.uid()=v_record.nutritionist_id and v_record.status='draft'
     and p_path like 'nutritionist/'||auth.uid()::text||'/'||p_record_id::text||'/%' then
    v_author:='nutritionist';
  elsif p_token is not null and v_record.public_access_token=p_token
     and (v_record.token_expires_at is null or v_record.token_expires_at>=now())
     and v_record.status not in ('submitted','completed','validated')
     and p_path like 'public/'||p_token::text||'/'||p_record_id::text||'/%' then
    v_author:='patient';
  else
    raise exception 'ANAMNESIS_FILE_ACCESS_DENIED' using errcode='42501';
  end if;
  if not private.can_access_anamnesis_attachment_object(p_path,true) then
    raise exception 'ANAMNESIS_FILE_PATH_INVALID' using errcode='22023'; end if;
  select * into v_object from storage.objects
  where bucket_id='anamnesis-attachments' and name=p_path;
  if not found then raise exception 'ANAMNESIS_FILE_NOT_UPLOADED' using errcode='P0002'; end if;
  if coalesce((v_object.metadata->>'size')::bigint,0)<=0
     or (v_object.metadata->>'size')::bigint>10485760
     or v_object.metadata->>'mimetype' not in
       ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'ANAMNESIS_FILE_INVALID' using errcode='22023';
  end if;
  v_sections:=v_record.template_snapshot->'sections';
  if v_sections is null then
    select t.sections into v_sections from public.anamnesis_templates t where t.id=v_record.template_id;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_sections,'[]'::jsonb)) section,
      jsonb_array_elements(coalesce(section.value->'fields','[]'::jsonb)) field
    where field.value->>'id'=p_field_id and field.value->>'type'='file'
  ) then raise exception 'ANAMNESIS_FILE_FIELD_INVALID' using errcode='22023'; end if;
  if jsonb_array_length(coalesce(v_record.attachments,'[]'::jsonb))>=20
     or exists(select 1 from jsonb_array_elements(coalesce(v_record.attachments,'[]'::jsonb)) item
       where item->>'storage_path'=p_path) then
    raise exception 'ANAMNESIS_FILE_LIMIT_OR_DUPLICATE' using errcode='22023';
  end if;
  v_attachment:=jsonb_build_object(
    'id',gen_random_uuid(),'field_id',p_field_id,
    'field_label',left(coalesce(p_field_label,''),160),
    'file_name',left(coalesce(nullif(p_file_name,''),'Anexo'),180),
    'file_size',(v_object.metadata->>'size')::bigint,
    'file_type',v_object.metadata->>'mimetype',
    'storage_path',p_path,'uploaded_by',v_author,'uploaded_at',now()
  );
  update public.anamnesis_records set
    attachments=coalesce(attachments,'[]'::jsonb)||jsonb_build_array(v_attachment),
    updated_at=now() where id=p_record_id returning attachments into v_sections;
  return v_sections;
end;
$function$;

create or replace function public.detach_anamnesis_file(
  p_record_id uuid,p_token uuid,p_attachment_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_record public.anamnesis_records%rowtype;
  v_attachment jsonb;
  v_remaining jsonb;
begin
  select * into v_record from public.anamnesis_records where id=p_record_id for update;
  if not found then raise exception 'ANAMNESIS_NOT_FOUND' using errcode='P0002'; end if;
  if not ((auth.uid()=v_record.nutritionist_id and v_record.status='draft')
    or (p_token is not null and v_record.public_access_token=p_token
      and (v_record.token_expires_at is null or v_record.token_expires_at>=now())
      and v_record.status not in ('submitted','completed','validated'))) then
    raise exception 'ANAMNESIS_FILE_ACCESS_DENIED' using errcode='42501';
  end if;
  select value into v_attachment from jsonb_array_elements(coalesce(v_record.attachments,'[]'::jsonb))
  where value->>'id'=p_attachment_id::text;
  if not found then raise exception 'ANAMNESIS_FILE_NOT_FOUND' using errcode='P0002'; end if;
  v_remaining:=(select coalesce(jsonb_agg(value),'[]'::jsonb)
    from jsonb_array_elements(coalesce(v_record.attachments,'[]'::jsonb))
    where value->>'id'<>p_attachment_id::text);
  update public.anamnesis_records set attachments=v_remaining,updated_at=now() where id=p_record_id;
  return jsonb_build_object('attachments',v_remaining,'storage_path',v_attachment->>'storage_path');
end;
$function$;

revoke all on function public.attach_anamnesis_file(uuid,uuid,text,text,text,text) from public;
revoke all on function public.detach_anamnesis_file(uuid,uuid,uuid) from public;
grant execute on function public.attach_anamnesis_file(uuid,uuid,text,text,text,text) to anon,authenticated;
grant execute on function public.detach_anamnesis_file(uuid,uuid,uuid) to anon,authenticated;
