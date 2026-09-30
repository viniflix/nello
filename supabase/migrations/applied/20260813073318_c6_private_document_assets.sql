-- C6.2: private, two-phase uploads for professional document assets.

create table public.document_asset_uploads (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.user_profiles(id) on delete restrict,
  identity_id uuid not null references public.professional_document_identities(id) on delete restrict,
  asset_type text not null check (asset_type in ('logo', 'visual_signature', 'stamp')),
  storage_bucket text not null default 'document-assets' check (storage_bucket = 'document-assets'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text,
  status text not null default 'uploading'
    check (status in ('uploading', 'confirmed', 'failed', 'expired')),
  failure_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  created_identity_id uuid references public.professional_document_identities(id) on delete restrict,
  constraint document_asset_upload_expiry check (expires_at > created_at),
  constraint document_asset_upload_confirmation check (
    (status = 'confirmed' and confirmed_at is not null and sha256 is not null and created_identity_id is not null)
    or (status <> 'confirmed' and confirmed_at is null and created_identity_id is null)
  )
);

create index document_asset_uploads_owner_status_idx
  on public.document_asset_uploads(professional_id, status, expires_at);

alter table public.document_asset_uploads enable row level security;
revoke all on table public.document_asset_uploads from public, anon, authenticated;
grant select, insert, update on table public.document_asset_uploads to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-assets', 'document-assets', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict(id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create or replace function private.can_upload_document_asset_object(
  p_bucket_id text,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_bucket_id = 'document-assets'
    and exists (
      select 1
      from public.document_asset_uploads u
      join public.professional_document_identities i
        on i.id = u.identity_id
       and i.professional_id = u.professional_id
       and i.status = 'active'
      where u.professional_id = auth.uid()
        and u.storage_bucket = p_bucket_id
        and u.storage_path = p_name
        and u.status = 'uploading'
        and u.expires_at > now()
    );
$$;

create or replace function private.can_read_document_asset_object(
  p_bucket_id text,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_bucket_id = 'document-assets'
    and exists (
      select 1
      from public.professional_document_identities i
      where i.professional_id = auth.uid()
        and i.status = 'active'
        and p_name in (i.logo_storage_path, i.signature_storage_path, i.stamp_storage_path)
    );
$$;

revoke all on function private.can_upload_document_asset_object(text, text)
  from public, anon, authenticated;
revoke all on function private.can_read_document_asset_object(text, text)
  from public, anon, authenticated;
grant execute on function private.can_upload_document_asset_object(text, text)
  to authenticated, service_role;
grant execute on function private.can_read_document_asset_object(text, text)
  to authenticated, service_role;

drop policy if exists document_assets_insert_reserved_intent on storage.objects;
create policy document_assets_insert_reserved_intent
on storage.objects for insert to authenticated
with check (private.can_upload_document_asset_object(bucket_id, name));

drop policy if exists document_assets_select_current_owner on storage.objects;
create policy document_assets_select_current_owner
on storage.objects for select to authenticated
using (private.can_read_document_asset_object(bucket_id, name));

create or replace function private.version_document_identity_asset(
  p_professional_id uuid,
  p_expected_identity_id uuid,
  p_asset_type text,
  p_storage_path text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
begin
  select * into v_current
  from public.professional_document_identities
  where professional_id = p_professional_id and status = 'active'
  for update;

  if not found or v_current.id is distinct from p_expected_identity_id then
    raise exception using errcode = '40001', message = 'identity_changed_since_upload_intent';
  end if;

  update public.professional_document_identities
  set status = 'archived', archived_at = now(), archive_reason = p_reason
  where id = v_current.id;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_current.id, p_professional_id, p_professional_id, 'superseded', p_reason,
    jsonb_build_object('version', v_current.version, 'superseded_by_version', v_current.version + 1)
  );

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path, created_by
  ) values (
    v_current.professional_id, v_current.verification_id, v_current.version + 1, 'active',
    v_current.professional_name, v_current.clinic_name, v_current.professional_email, v_current.professional_phone,
    v_current.address_line, v_current.address_city, v_current.address_state, v_current.address_postal_code,
    v_current.primary_color, v_current.accent_color, v_current.header_text, v_current.footer_text,
    v_current.crn_region, v_current.crn_number, v_current.normalized_crn,
    case when p_asset_type = 'logo' then p_storage_path else v_current.logo_storage_path end,
    case when p_asset_type = 'visual_signature' then p_storage_path else v_current.signature_storage_path end,
    case when p_asset_type = 'stamp' then p_storage_path else v_current.stamp_storage_path end,
    p_professional_id
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, p_professional_id, p_professional_id, 'created', p_reason,
    jsonb_build_object(
      'version', v_saved.version,
      'previous_version', v_current.version,
      'asset_type', p_asset_type
    )
  );

  return v_saved.id;
end;
$$;

revoke all on function private.version_document_identity_asset(uuid, uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.create_document_asset_upload_intent(
  p_asset_type text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expected_identity_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_identity public.professional_document_identities%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_limit bigint;
  v_filename text := nullif(btrim(p_original_filename), '');
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_asset_type not in ('logo', 'visual_signature', 'stamp') then
    raise exception using errcode = '22023', message = 'invalid_document_asset_type';
  end if;
  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception using errcode = '22023', message = 'unsupported_document_asset_mime';
  end if;
  v_limit := case when p_asset_type = 'logo' then 5242880 else 2097152 end;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > v_limit then
    raise exception using errcode = '22023', message = 'invalid_document_asset_size';
  end if;
  if v_filename is null or length(v_filename) > 255 or v_filename ~ '[[:cntrl:]/\\]' then
    raise exception using errcode = '22023', message = 'invalid_document_asset_filename';
  end if;
  if not exists (
    select 1 from public.professional_verifications v
    where v.user_id = v_actor and v.professional_role = 'nutritionist'
      and v.status = 'approved' and v.valid_until > now()
  ) then
    raise exception using errcode = '42501', message = 'document_asset_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_asset:' || v_actor::text, 0));
  select * into v_identity
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'active_document_identity_required';
  end if;
  if p_expected_identity_version is null or p_expected_identity_version <> v_identity.version then
    raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
  end if;

  v_path := v_actor::text || '/' || p_asset_type || '/' || v_id::text;
  insert into public.document_asset_uploads(
    id, professional_id, identity_id, asset_type, storage_path,
    original_filename, mime_type, size_bytes, expires_at
  ) values (
    v_id, v_actor, v_identity.id, p_asset_type, v_path,
    v_filename, p_mime_type, p_size_bytes, v_expires_at
  );

  return jsonb_build_object(
    'upload_id', v_id,
    'storage_bucket', 'document-assets',
    'storage_path', v_path,
    'asset_type', p_asset_type,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.confirm_document_asset_upload(
  p_upload_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_upload public.document_asset_uploads%rowtype;
  v_metadata jsonb;
  v_owner_id text;
  v_created_identity_id uuid;
  v_reason text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_sha256';
  end if;

  select * into v_upload
  from public.document_asset_uploads
  where id = p_upload_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'document_asset_upload_not_found'; end if;
  if v_upload.professional_id <> v_actor then
    raise exception using errcode = '42501', message = 'document_asset_confirmation_forbidden';
  end if;
  if v_upload.status <> 'uploading' then
    raise exception using errcode = '23514', message = 'document_asset_upload_already_finalized';
  end if;
  if v_upload.expires_at <= now() then
    update public.document_asset_uploads
    set status = 'expired', failure_code = 'upload_expired'
    where id = v_upload.id;
    return jsonb_build_object('success', false, 'code', 'upload_expired', 'upload_id', v_upload.id);
  end if;

  select metadata, owner_id into v_metadata, v_owner_id
  from storage.objects
  where bucket_id = v_upload.storage_bucket and name = v_upload.storage_path;
  if not found then raise exception using errcode = 'P0002', message = 'uploaded_document_asset_not_found'; end if;
  if v_owner_id is distinct from v_actor::text
     or v_metadata->>'size' is null
     or (v_metadata->>'size')::bigint is distinct from v_upload.size_bytes
     or v_metadata->>'mimetype' is distinct from v_upload.mime_type
     or p_size_bytes is distinct from v_upload.size_bytes
     or p_mime_type is distinct from v_upload.mime_type then
    raise exception using errcode = '22023', message = 'document_asset_metadata_mismatch';
  end if;

  v_reason := 'document_' || v_upload.asset_type || '_updated';
  v_created_identity_id := private.version_document_identity_asset(
    v_actor, v_upload.identity_id, v_upload.asset_type, v_upload.storage_path, v_reason
  );

  update public.document_asset_uploads
  set status = 'confirmed', sha256 = p_sha256, confirmed_at = now(),
      created_identity_id = v_created_identity_id
  where id = v_upload.id;

  return jsonb_build_object(
    'success', true,
    'upload_id', v_upload.id,
    'asset_type', v_upload.asset_type,
    'identity_id', v_created_identity_id
  );
end;
$$;

create or replace function public.fail_document_asset_upload(
  p_upload_id uuid,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := nullif(btrim(p_failure_code), '');
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if v_code is null or v_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception using errcode = '22023', message = 'invalid_document_asset_failure_code';
  end if;
  update public.document_asset_uploads
  set status = 'failed', failure_code = v_code
  where id = p_upload_id and professional_id = v_actor and status = 'uploading';
  if not found then raise exception using errcode = '42501', message = 'document_asset_failure_forbidden'; end if;
  return jsonb_build_object('success', true, 'upload_id', p_upload_id, 'status', 'failed');
end;
$$;

create or replace function public.get_my_document_asset_preview(p_asset_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_identity public.professional_document_identities%rowtype;
  v_path text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_asset_type not in ('logo', 'visual_signature', 'stamp') then
    raise exception using errcode = '22023', message = 'invalid_document_asset_type';
  end if;
  select * into v_identity from public.professional_document_identities
  where professional_id = v_actor and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'active_document_identity_not_found'; end if;
  v_path := case p_asset_type
    when 'logo' then v_identity.logo_storage_path
    when 'visual_signature' then v_identity.signature_storage_path
    else v_identity.stamp_storage_path end;
  return jsonb_build_object(
    'available', v_path is not null,
    'asset_type', p_asset_type,
    'storage_bucket', case when v_path is not null then 'document-assets' end,
    'storage_path', v_path,
    'expires_in', 300
  );
end;
$$;

create or replace function public.expire_document_asset_uploads(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'invalid_expiration_limit';
  end if;
  with expired as (
    select id from public.document_asset_uploads
    where status = 'uploading' and expires_at <= now()
    order by expires_at, id for update skip locked limit p_limit
  )
  update public.document_asset_uploads u
  set status = 'expired', failure_code = 'upload_expired'
  from expired e where u.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_document_asset_upload_intent(text, text, text, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.confirm_document_asset_upload(uuid, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.fail_document_asset_upload(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_my_document_asset_preview(text)
  from public, anon, authenticated;
revoke all on function public.expire_document_asset_uploads(integer)
  from public, anon, authenticated;
grant execute on function public.create_document_asset_upload_intent(text, text, text, bigint, integer)
  to authenticated, service_role;
grant execute on function public.confirm_document_asset_upload(uuid, text, bigint, text)
  to authenticated, service_role;
grant execute on function public.fail_document_asset_upload(uuid, text)
  to authenticated, service_role;
grant execute on function public.get_my_document_asset_preview(text)
  to authenticated, service_role;
grant execute on function public.expire_document_asset_uploads(integer)
  to service_role;
