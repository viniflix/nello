alter view public.patient_hub_summary set (security_invoker = true);
revoke all on table public.patient_hub_summary from anon;

revoke all on function public.extract_and_inject_clinical_flags(uuid) from anon;
revoke all on function public.generate_anamnesis_link(uuid, uuid, integer) from anon;

create or replace function public.extract_and_inject_clinical_flags(p_record_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_record record; v_new_flags jsonb := '{}'::jsonb; v_field record; v_section record; v_answer text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  select r.*, t.sections into v_record from public.anamnesis_records r left join public.anamnesis_templates t on t.id=r.template_id where r.id=p_record_id and r.nutritionist_id=auth.uid();
  if not found then raise exception 'Acesso negado.'; end if;
  for v_section in select * from jsonb_array_elements(coalesce(v_record.sections,'[]'::jsonb)) s loop
    for v_field in select * from jsonb_array_elements(coalesce(v_section.value->'fields','[]'::jsonb)) f loop
      if v_field.value->>'clinical_flag_key' is not null then
        v_answer := v_record.content->>(v_field.value->>'id');
        if v_answer is not null and v_answer <> '' and v_answer not in ('false','nao','não') then
          v_new_flags := v_new_flags || jsonb_build_object(v_field.value->>'clinical_flag_key',jsonb_build_object('value',v_answer,'label',v_field.value->>'label','captured_at',now()::text,'source','anamnesis','record_id',p_record_id::text));
        end if;
      end if;
    end loop;
  end loop;
  if v_new_flags <> '{}'::jsonb then update public.user_profiles set clinical_flags=coalesce(clinical_flags,'{}'::jsonb)||v_new_flags where id=v_record.patient_id; end if;
  return jsonb_build_object('success',true,'flags_injected',v_new_flags);
end $$;

create or replace function public.generate_anamnesis_link(p_record_id uuid,p_nutritionist_id uuid,p_expires_days integer default 7)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token uuid; v_expires_at timestamptz;
begin
  if auth.uid() is null or auth.uid() is distinct from p_nutritionist_id then raise exception 'Acesso negado.'; end if;
  if p_expires_days not between 1 and 30 then raise exception 'Prazo inválido.'; end if;
  if not exists(select 1 from public.anamnesis_records where id=p_record_id and nutritionist_id=auth.uid()) then raise exception 'Acesso negado.'; end if;
  v_token:=gen_random_uuid(); v_expires_at:=now()+(p_expires_days||' days')::interval;
  update public.anamnesis_records set public_access_token=v_token,token_expires_at=v_expires_at,status=case when status='draft' then 'awaiting_patient' else status end,updated_at=now() where id=p_record_id;
  return jsonb_build_object('success',true,'token',v_token,'expires_at',v_expires_at,'status','awaiting_patient');
end $$;
