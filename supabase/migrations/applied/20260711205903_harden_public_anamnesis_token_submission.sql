revoke execute on function public.notify_nutritionist_anamnesis_completed(uuid) from public, anon, authenticated;
grant execute on function public.notify_nutritionist_anamnesis_completed(uuid) to service_role;

create or replace function public.submit_anamnesis_by_token(p_token uuid,p_content jsonb,p_status text,p_lgpd_consented boolean default null,p_ip text default null,p_clinical_flags jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_record record; v_flags jsonb := '{}'::jsonb; v_section record; v_field record; v_answer text; v_result jsonb;
begin
  if p_status not in ('draft','completed') then raise exception 'INVALID_STATUS'; end if;
  select r.*, coalesce(r.template_snapshot->'sections', t.sections, '[]'::jsonb) as resolved_sections
  into v_record from public.anamnesis_records r left join public.anamnesis_templates t on t.id=r.template_id
  where r.public_access_token=p_token and (r.token_expires_at is null or r.token_expires_at >= now()) and r.status not in ('completed','validated');
  if not found then raise exception 'TOKEN_INVALID_OR_EXPIRED'; end if;
  if p_status='completed' and coalesce(p_lgpd_consented,false) is not true then raise exception 'LGPD_CONSENT_REQUIRED'; end if;
  if p_status='completed' then
    for v_section in select * from jsonb_array_elements(v_record.resolved_sections) s loop
      for v_field in select * from jsonb_array_elements(coalesce(v_section.value->'fields','[]'::jsonb)) f loop
        if v_field.value->>'clinical_flag_key' is not null then
          v_answer:=p_content->>(v_field.value->>'id');
          if v_answer is not null and v_answer<>'' and v_answer not in ('false','nao','não') then
            v_flags:=v_flags||jsonb_build_object(v_field.value->>'clinical_flag_key',jsonb_build_object('value',v_answer,'label',v_field.value->>'label','captured_at',now()::text,'source','patient','record_id',v_record.id::text));
          end if;
        end if;
      end loop;
    end loop;
  end if;
  update public.anamnesis_records set content=coalesce(p_content,'{}'::jsonb),status=p_status,lgpd_consented=coalesce(p_lgpd_consented,lgpd_consented),lgpd_consented_at=case when p_lgpd_consented is true and lgpd_consented_at is null then now() else lgpd_consented_at end,lgpd_ip_address=case when p_ip is null then lgpd_ip_address else null end,updated_at=now()
  where id=v_record.id returning jsonb_build_object('success',true,'status',status) into v_result;
  if p_status='completed' then
    if v_flags<>'{}'::jsonb then update public.user_profiles set clinical_flags=coalesce(clinical_flags,'{}'::jsonb)||v_flags,updated_at=now() where id=v_record.patient_id; end if;
    perform public.notify_nutritionist_anamnesis_completed(v_record.id);
  end if;
  return v_result;
end $$;
