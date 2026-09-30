-- Forward-only correction. Keep the original signature, owner, ACL and error contracts.
CREATE OR REPLACE FUNCTION public.detach_anamnesis_file(p_record_id uuid, p_token uuid, p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_record public.anamnesis_records%rowtype;
  v_attachment jsonb;
  v_remaining jsonb;
begin
  select * into v_record from public.anamnesis_records where id=p_record_id for update;
  if not found then raise exception 'ANAMNESIS_NOT_FOUND' using errcode='P0002'; end if;
  if ((auth.uid()=v_record.nutritionist_id and v_record.status='draft')
    or (p_token is not null and v_record.public_access_token=p_token
      and (v_record.token_expires_at is null or v_record.token_expires_at>=now())
      and v_record.status not in ('submitted','completed','validated'))) is not true then
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
