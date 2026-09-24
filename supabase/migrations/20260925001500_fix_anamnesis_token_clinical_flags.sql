-- Submitting a public anamnesis with a clinical flag failed because
-- user_profiles has no updated_at column. Preserve the existing token,
-- consent and notification behavior while removing that invalid assignment.
create or replace function public.submit_anamnesis_by_token(
  p_token uuid,
  p_content jsonb,
  p_status text,
  p_lgpd_consented boolean default null,
  p_ip text default null,
  p_clinical_flags jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_record record;
  v_flags jsonb := '{}'::jsonb;
  v_section record;
  v_field record;
  v_answer text;
  v_result jsonb;
begin
  if p_status is null or p_status not in ('draft','submitted') then
    raise exception 'INVALID_STATUS';
  end if;
  if jsonb_typeof(p_content) is distinct from 'object' or pg_column_size(p_content) > 1048576 then
    raise exception 'INVALID_CONTENT';
  end if;
  select r.*, coalesce(r.template_snapshot->'sections',t.sections,'[]'::jsonb) as resolved_sections
  into v_record from public.anamnesis_records r
  left join public.anamnesis_templates t on t.id = r.template_id
  where r.public_access_token = p_token
    and (r.token_expires_at is null or r.token_expires_at >= now())
    and r.status not in ('submitted','completed','validated')
  for update of r;
  if not found then raise exception 'TOKEN_INVALID_OR_EXPIRED'; end if;
  if p_status = 'submitted' and coalesce(p_lgpd_consented,false) is not true then
    raise exception 'LGPD_CONSENT_REQUIRED';
  end if;
  if p_status = 'submitted' then
    for v_section in select * from jsonb_array_elements(v_record.resolved_sections) s loop
      for v_field in select * from jsonb_array_elements(coalesce(v_section.value->'fields','[]'::jsonb)) f loop
        if v_field.value->>'clinical_flag_key' is not null then
          v_answer := p_content->>(v_field.value->>'id');
          if v_answer is not null and v_answer <> '' and v_answer not in ('false','nao','não') then
            v_flags := v_flags || jsonb_build_object(
              v_field.value->>'clinical_flag_key',
              jsonb_build_object('value',v_answer,'label',v_field.value->>'label',
                'captured_at',now()::text,'source','patient','record_id',v_record.id::text)
            );
          end if;
        end if;
      end loop;
    end loop;
  end if;
  update public.anamnesis_records set
    content = p_content,
    status = p_status,
    public_access_token = case when p_status = 'submitted' then null else public_access_token end,
    lgpd_consented = coalesce(p_lgpd_consented,lgpd_consented),
    lgpd_consented_at = case when p_lgpd_consented is true and lgpd_consented_at is null then now() else lgpd_consented_at end,
    lgpd_ip_address = case when p_ip is null then lgpd_ip_address else null end,
    updated_at = now()
  where id = v_record.id and public_access_token = p_token
    and status not in ('submitted','completed','validated')
  returning jsonb_build_object('success',true,'status',status) into v_result;
  if not found then raise exception 'TOKEN_INVALID_OR_EXPIRED'; end if;
  if p_status = 'submitted' then
    if v_flags <> '{}'::jsonb then
      update public.user_profiles set
        clinical_flags = coalesce(clinical_flags,'{}'::jsonb) || v_flags
      where id = v_record.patient_id;
    end if;
    perform public.notify_nutritionist_anamnesis_completed(v_record.id);
  end if;
  return v_result;
end;
$function$;
