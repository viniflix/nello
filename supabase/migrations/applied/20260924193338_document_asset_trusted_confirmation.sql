-- The browser must never supply the authoritative digest for a document asset.
-- This RPC is callable only by the service role after an Edge Function has
-- downloaded and hashed the actual Storage object.
create or replace function public.confirm_document_asset_upload_verified(
  p_upload_id uuid,
  p_actor_id uuid,
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
  v_upload public.document_asset_uploads%rowtype;
  v_metadata jsonb;
  v_owner_id text;
  v_created_identity_id uuid;
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception using errcode = '42501', message = 'trusted_document_confirmation_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_sha256';
  end if;

  select * into v_upload
  from public.document_asset_uploads
  where id = p_upload_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'document_asset_upload_not_found'; end if;
  if v_upload.professional_id is distinct from p_actor_id then
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
  if v_owner_id is distinct from p_actor_id::text
     or v_metadata->>'size' is null
     or (v_metadata->>'size')::bigint is distinct from v_upload.size_bytes
     or v_metadata->>'mimetype' is distinct from v_upload.mime_type
     or p_size_bytes is distinct from v_upload.size_bytes
     or p_mime_type is distinct from v_upload.mime_type then
    raise exception using errcode = '22023', message = 'document_asset_metadata_mismatch';
  end if;

  v_created_identity_id := private.version_document_identity_asset(
    p_actor_id, v_upload.identity_id, v_upload.asset_type, v_upload.storage_path,
    'document_' || v_upload.asset_type || '_updated'
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

revoke all on function public.confirm_document_asset_upload_verified(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.confirm_document_asset_upload_verified(uuid, uuid, text, bigint, text)
  to service_role;
