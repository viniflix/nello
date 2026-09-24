-- Apply only after the new Edge Function and frontend are live.
revoke all on function public.confirm_document_asset_upload(uuid, text, bigint, text)
  from public, anon, authenticated;

-- Keep the old signature unavailable even if a future default grant is added.
create or replace function public.confirm_document_asset_upload(
  p_upload_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'document_asset_confirmation_moved_to_trusted_service';
end;
$$;

revoke all on function public.confirm_document_asset_upload(uuid, text, bigint, text)
  from public, anon, authenticated;
