-- C5 etapa 3: bucket privado e upload clinico em duas fases.
-- Leitura, URLs assinadas e ciclo clinico pertencem as etapas seguintes.

alter table public.clinical_attachments
  add column upload_expires_at timestamptz not null default (now()+interval '15 minutes'),
  add column upload_confirmed_at timestamptz;

alter table public.clinical_attachments
  add constraint clinical_attachments_upload_expiry_check
    check (upload_expires_at>created_at),
  add constraint clinical_attachments_upload_confirmation_check
    check (upload_confirmed_at is null or upload_confirmed_at>=created_at);

create function private.protect_clinical_attachment_upload_fields()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.upload_expires_at<>new.upload_expires_at then
    raise exception 'clinical_attachment_upload_expiry_is_immutable';
  end if;
  if old.upload_confirmed_at is not null
    and old.upload_confirmed_at is distinct from new.upload_confirmed_at then
    raise exception 'clinical_attachment_upload_confirmation_is_immutable';
  end if;
  if old.upload_confirmed_at is null and new.upload_confirmed_at is not null
    and not (old.status='uploading' and new.status in ('active','pending_review')) then
    raise exception 'clinical_attachment_invalid_upload_confirmation';
  end if;
  return new;
end
$$;

create trigger trg_protect_clinical_attachment_upload_fields
  before update on public.clinical_attachments
  for each row execute function private.protect_clinical_attachment_upload_fields();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'clinical-attachments','clinical-attachments',false,15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();

create function private.can_upload_clinical_attachment_object(p_bucket_id text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null
    and p_bucket_id='clinical-attachments'
    and exists(
      select 1
      from public.clinical_attachments a
      join public.care_episodes e on e.id=a.care_episode_id and e.patient_id=a.patient_id
      where a.storage_bucket=p_bucket_id
        and a.storage_path=p_name
        and a.author_id=(select auth.uid())
        and a.status='uploading'
        and a.upload_confirmed_at is null
        and a.upload_expires_at>now()
        and e.status='active'
    )
$$;

drop policy if exists clinical_attachments_insert_reserved_intent on storage.objects;
create policy clinical_attachments_insert_reserved_intent
on storage.objects for insert to authenticated
with check (private.can_upload_clinical_attachment_object(bucket_id,name));

create function public.create_clinical_attachment_upload_intent(
  p_patient_id uuid,
  p_care_episode_id uuid,
  p_clinical_record_id uuid,
  p_category_code text,
  p_description text,
  p_clinical_date date,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
  v_source text;
  v_attachment_id uuid:=gen_random_uuid();
  v_storage_path text:=v_attachment_id::text;
  v_filename text:=btrim(p_original_filename);
  v_expires_at timestamptz:=now()+interval '15 minutes';
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_care_episode_id is null then
    raise exception using errcode='22023',message='patient_and_episode_required';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception using errcode='22023',message='unsupported_mime_type';
  end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>15728640 then
    raise exception using errcode='22023',message='invalid_file_size';
  end if;
  if v_filename is null or length(v_filename)<1 or length(v_filename)>255
    or v_filename ~ '[[:cntrl:]/\\]' then
    raise exception using errcode='22023',message='invalid_original_filename';
  end if;
  if not exists(
    select 1 from public.clinical_attachment_categories c
    where c.code=p_category_code and c.is_active
  ) then raise exception using errcode='22023',message='invalid_attachment_category'; end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_care_episode_id and e.patient_id=p_patient_id
  for share;
  if not found then
    raise exception using errcode='42501',message='episode_upload_forbidden';
  end if;
  if v_episode.status<>'active' then
    raise exception using errcode='42501',message='active_episode_required';
  end if;

  if v_actor=v_episode.patient_id then
    v_source:='patient';
    if p_clinical_record_id is not null then
      raise exception using errcode='42501',message='patient_cannot_link_clinical_record';
    end if;
  elsif private.lock_and_can_write_active_care_episode(p_care_episode_id) then
    v_source:=case when v_actor=v_episode.student_id then 'student' else 'nutritionist' end;
  else
    raise exception using errcode='42501',message='episode_upload_forbidden';
  end if;

  if p_clinical_record_id is not null and not exists(
    select 1 from public.clinical_records r
    where r.id=p_clinical_record_id and r.patient_id=p_patient_id
      and r.care_episode_id=p_care_episode_id
  ) then raise exception using errcode='23503',message='clinical_record_scope_mismatch'; end if;

  insert into public.clinical_attachments(
    id,patient_id,care_episode_id,clinical_record_id,category_code,description,
    clinical_date,source,author_id,storage_bucket,storage_path,original_filename,
    mime_type,size_bytes,sha256,status,visibility,upload_expires_at
  ) values (
    v_attachment_id,p_patient_id,p_care_episode_id,p_clinical_record_id,p_category_code,
    nullif(btrim(p_description),''),p_clinical_date,v_source,v_actor,
    'clinical-attachments',v_storage_path,v_filename,p_mime_type,p_size_bytes,null,
    'uploading','professional_private',v_expires_at
  );

  return jsonb_build_object(
    'attachment_id',v_attachment_id,
    'storage_bucket','clinical-attachments',
    'storage_path',v_storage_path,
    'status','uploading',
    'expires_at',v_expires_at
  );
end
$$;

create function public.confirm_clinical_attachment_upload(
  p_attachment_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_object_metadata jsonb;
  v_object_owner_id text;
  v_object_size_text text;
  v_object_mime text;
  v_target_status text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;

  select a.* into v_attachment
  from public.clinical_attachments a
  where a.id=p_attachment_id
  for update;
  if not found then raise exception using errcode='P0002',message='upload_intent_not_found'; end if;
  if v_attachment.author_id<>v_actor then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;
  if v_attachment.status<>'uploading' or v_attachment.upload_confirmed_at is not null then
    raise exception 'upload_already_finalized';
  end if;
  if v_attachment.upload_expires_at<=now() then
    perform set_config('app.clinical_attachment_reason','upload_intent_expired',true);
    update public.clinical_attachments set status='upload_failed' where id=v_attachment.id;
    return jsonb_build_object('success',false,'code','upload_expired','attachment_id',v_attachment.id);
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_sha256';
  end if;
  if v_attachment.source='patient' then
    if not exists(
      select 1 from public.care_episodes e
      where e.id=v_attachment.care_episode_id and e.patient_id=v_actor and e.status='active'
    ) then raise exception using errcode='42501',message='upload_confirmation_forbidden'; end if;
  elsif not private.lock_and_can_write_active_care_episode(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;

  select o.metadata,o.owner_id into v_object_metadata,v_object_owner_id
  from storage.objects o
  where o.bucket_id=v_attachment.storage_bucket and o.name=v_attachment.storage_path;
  if not found then raise exception 'uploaded_object_not_found'; end if;

  v_object_size_text:=v_object_metadata->>'size';
  v_object_mime:=v_object_metadata->>'mimetype';
  if v_object_owner_id is distinct from v_actor::text
    or v_object_size_text is null or v_object_size_text !~ '^[0-9]+$'
    or v_object_size_text::bigint<>v_attachment.size_bytes
    or p_size_bytes is null or p_size_bytes<>v_attachment.size_bytes
    or v_object_mime is distinct from v_attachment.mime_type
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception 'upload_metadata_mismatch';
  end if;

  v_target_status:=case when v_attachment.source='patient' then 'pending_review' else 'active' end;
  perform set_config('app.clinical_attachment_reason','upload_confirmed',true);
  update public.clinical_attachments
  set sha256=p_sha256,status=v_target_status,upload_confirmed_at=now()
  where id=v_attachment.id;

  return jsonb_build_object(
    'success',true,'attachment_id',v_attachment.id,'status',v_target_status
  );
end
$$;

create function public.fail_clinical_attachment_upload(p_attachment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=btrim(p_reason);
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if v_reason is null or v_reason !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception using errcode='22023',message='invalid_upload_failure_code';
  end if;

  select a.* into v_attachment from public.clinical_attachments a
  where a.id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='upload_intent_not_found'; end if;
  if v_attachment.author_id<>v_actor then
    raise exception using errcode='42501',message='upload_failure_forbidden';
  end if;
  if v_attachment.status<>'uploading' or v_attachment.upload_confirmed_at is not null then
    raise exception 'upload_already_finalized';
  end if;

  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set status='upload_failed' where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'status','upload_failed');
end
$$;

create function public.expire_clinical_attachment_uploads(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit<1 or p_limit>1000 then
    raise exception using errcode='22023',message='invalid_expiration_limit';
  end if;
  perform set_config('app.clinical_attachment_reason','upload_intent_expired',true);
  with expired as (
    select a.id from public.clinical_attachments a
    where a.status='uploading' and a.upload_confirmed_at is null and a.upload_expires_at<=now()
    order by a.upload_expires_at,a.id
    for update skip locked limit p_limit
  )
  update public.clinical_attachments a set status='upload_failed'
  from expired e where a.id=e.id;
  get diagnostics v_count=row_count;
  return v_count;
end
$$;

revoke all on function private.protect_clinical_attachment_upload_fields(),
  private.can_upload_clinical_attachment_object(text,text) from public,anon,authenticated;
grant execute on function private.can_upload_clinical_attachment_object(text,text) to authenticated,service_role;

revoke all on function public.create_clinical_attachment_upload_intent(uuid,uuid,uuid,text,text,date,text,text,bigint),
  public.confirm_clinical_attachment_upload(uuid,text,bigint,text),
  public.fail_clinical_attachment_upload(uuid,text),
  public.expire_clinical_attachment_uploads(integer) from public,anon,authenticated;
grant execute on function public.create_clinical_attachment_upload_intent(uuid,uuid,uuid,text,text,date,text,text,bigint),
  public.confirm_clinical_attachment_upload(uuid,text,bigint,text),
  public.fail_clinical_attachment_upload(uuid,text) to authenticated,service_role;
grant execute on function public.expire_clinical_attachment_uploads(integer) to service_role;
