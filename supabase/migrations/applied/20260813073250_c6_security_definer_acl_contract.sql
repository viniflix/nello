-- C6.0: converge the browser-callable SECURITY DEFINER ACLs with the
-- production allowlist before the document engine adds new RPCs.

-- An older duplicate foundation migration accidentally recreated this wrapper
-- without SECURITY DEFINER in a clean replay. Restore the reviewed production
-- contract: the private routine performs the participant authorization.
create or replace function public.end_care_episode(
  p_patient_id uuid,
  p_end_reason text default null
)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.end_care_episode($1, $2); $$;

revoke all on function public.end_care_episode(uuid, text)
  from public, anon, authenticated;
grant execute on function public.end_care_episode(uuid, text)
  to authenticated, service_role;

create or replace function public.extract_and_inject_clinical_flags(
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record record;
  v_new_flags jsonb := '{}'::jsonb;
  v_field record;
  v_section record;
  v_answer text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select r.*, t.sections
  into v_record
  from public.anamnesis_records r
  left join public.anamnesis_templates t on t.id = r.template_id
  where r.id = p_record_id
    and r.nutritionist_id = auth.uid();

  if not found then
    raise exception 'Acesso negado.';
  end if;

  for v_section in
    select * from jsonb_array_elements(coalesce(v_record.sections, '[]'::jsonb)) s
  loop
    for v_field in
      select * from jsonb_array_elements(coalesce(v_section.value->'fields', '[]'::jsonb)) f
    loop
      if v_field.value->>'clinical_flag_key' is not null then
        v_answer := v_record.content->>(v_field.value->>'id');
        if v_answer is not null
           and v_answer <> ''
           and v_answer not in ('false', 'nao', 'não') then
          v_new_flags := v_new_flags || jsonb_build_object(
            v_field.value->>'clinical_flag_key',
            jsonb_build_object(
              'value', v_answer,
              'label', v_field.value->>'label',
              'captured_at', now()::text,
              'source', 'anamnesis',
              'record_id', p_record_id::text
            )
          );
        end if;
      end if;
    end loop;
  end loop;

  if v_new_flags <> '{}'::jsonb then
    update public.user_profiles
    set clinical_flags = coalesce(clinical_flags, '{}'::jsonb) || v_new_flags
    where id = v_record.patient_id;
  end if;

  return jsonb_build_object('success', true, 'flags_injected', v_new_flags);
end;
$$;

revoke all on function public.extract_and_inject_clinical_flags(uuid)
  from public, anon, authenticated;
grant execute on function public.extract_and_inject_clinical_flags(uuid)
  to authenticated, service_role;

create or replace function public.generate_anamnesis_link(
  p_record_id uuid,
  p_nutritionist_id uuid,
  p_expires_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null or auth.uid() is distinct from p_nutritionist_id then
    raise exception 'Acesso negado.';
  end if;
  if p_expires_days not between 1 and 30 then
    raise exception 'Prazo inválido.';
  end if;
  if not exists (
    select 1
    from public.anamnesis_records
    where id = p_record_id
      and nutritionist_id = auth.uid()
  ) then
    raise exception 'Acesso negado.';
  end if;

  v_token := gen_random_uuid();
  v_expires_at := now() + (p_expires_days || ' days')::interval;
  update public.anamnesis_records
  set public_access_token = v_token,
      token_expires_at = v_expires_at,
      status = case when status = 'draft' then 'awaiting_patient' else status end,
      updated_at = now()
  where id = p_record_id;

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'status', 'awaiting_patient'
  );
end;
$$;

revoke all on function public.generate_anamnesis_link(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.generate_anamnesis_link(uuid, uuid, integer)
  to authenticated, service_role;

-- This function is an internal notification helper and must never be exposed
-- through PostgREST to a browser role.
revoke all on function public.notify_nutritionist_anamnesis_completed(uuid)
  from public, anon, authenticated;
grant execute on function public.notify_nutritionist_anamnesis_completed(uuid)
  to service_role;

-- Preserve the hardened public-token submission contract in clean rebuilds.
-- The token is the authorization factor, but it is valid only while unexpired,
-- unfinished and (for completion) accompanied by explicit LGPD consent.
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
set search_path = public, pg_temp
as $$
declare
  v_record record;
  v_flags jsonb := '{}'::jsonb;
  v_section record;
  v_field record;
  v_answer text;
  v_result jsonb;
begin
  if p_status not in ('draft', 'completed') then
    raise exception 'INVALID_STATUS';
  end if;

  select
    r.*,
    coalesce(r.template_snapshot->'sections', t.sections, '[]'::jsonb) as resolved_sections
  into v_record
  from public.anamnesis_records r
  left join public.anamnesis_templates t on t.id = r.template_id
  where r.public_access_token = p_token
    and (r.token_expires_at is null or r.token_expires_at >= now())
    and r.status not in ('completed', 'validated');

  if not found then
    raise exception 'TOKEN_INVALID_OR_EXPIRED';
  end if;
  if p_status = 'completed' and coalesce(p_lgpd_consented, false) is not true then
    raise exception 'LGPD_CONSENT_REQUIRED';
  end if;

  if p_status = 'completed' then
    for v_section in
      select * from jsonb_array_elements(v_record.resolved_sections) s
    loop
      for v_field in
        select * from jsonb_array_elements(coalesce(v_section.value->'fields', '[]'::jsonb)) f
      loop
        if v_field.value->>'clinical_flag_key' is not null then
          v_answer := p_content->>(v_field.value->>'id');
          if v_answer is not null
             and v_answer <> ''
             and v_answer not in ('false', 'nao', 'não') then
            v_flags := v_flags || jsonb_build_object(
              v_field.value->>'clinical_flag_key',
              jsonb_build_object(
                'value', v_answer,
                'label', v_field.value->>'label',
                'captured_at', now()::text,
                'source', 'patient',
                'record_id', v_record.id::text
              )
            );
          end if;
        end if;
      end loop;
    end loop;
  end if;

  update public.anamnesis_records
  set content = coalesce(p_content, '{}'::jsonb),
      status = p_status,
      lgpd_consented = coalesce(p_lgpd_consented, lgpd_consented),
      lgpd_consented_at = case
        when p_lgpd_consented is true and lgpd_consented_at is null then now()
        else lgpd_consented_at
      end,
      -- Minimize personal data: merely note that an address was supplied; do
      -- not persist the raw address in this public-token flow.
      lgpd_ip_address = case when p_ip is null then lgpd_ip_address else null end,
      updated_at = now()
  where id = v_record.id
  returning jsonb_build_object('success', true, 'status', status) into v_result;

  if p_status = 'completed' then
    if v_flags <> '{}'::jsonb then
      update public.user_profiles
      set clinical_flags = coalesce(clinical_flags, '{}'::jsonb) || v_flags,
          updated_at = now()
      where id = v_record.patient_id;
    end if;
    perform public.notify_nutritionist_anamnesis_completed(v_record.id);
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_anamnesis_by_token(uuid, jsonb, text, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_anamnesis_by_token(uuid, jsonb, text, boolean, text, jsonb)
  to public, anon, authenticated, service_role;
