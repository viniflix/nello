begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'get_my_document_identity()',
    'save_my_document_identity(jsonb,integer,text)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'c6_identity_rpc_missing:%', v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.' || v_signature)
        and p.prosecdef
        and p.proconfig = array['search_path=""']
    ) then
      raise exception 'c6_identity_rpc_not_hardened:%', v_signature;
    end if;
    if has_function_privilege('public', 'public.' || v_signature, 'execute')
       or has_function_privilege('anon', 'public.' || v_signature, 'execute')
       or not has_function_privilege('authenticated', 'public.' || v_signature, 'execute') then
      raise exception 'c6_identity_rpc_grant_drift:%', v_signature;
    end if;
  end loop;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))) <> 60 then
    raise exception 'c6_identity_security_definer_surface_drift';
  end if;

  if has_table_privilege('authenticated', 'public.professional_document_identities', 'select')
     or has_table_privilege('authenticated', 'public.professional_document_identities', 'insert')
     or has_table_privilege('authenticated', 'public.professional_document_identities', 'update')
     or has_table_privilege('authenticated', 'public.professional_document_identities', 'delete')
     or has_table_privilege('authenticated', 'public.professional_document_identity_events', 'select')
     or has_table_privilege('anon', 'public.professional_document_identities', 'select') then
    raise exception 'c6_identity_direct_table_access_exposed';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('professional_document_identities', 'professional_document_identity_events')
  ) then
    raise exception 'c6_identity_unexpected_direct_policy';
  end if;
end;
$$;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000001','authenticated','authenticated','c6-pro@nello.test','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000002','authenticated','authenticated','c6-student@nello.test','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000003','authenticated','authenticated','c6-patient@nello.test','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000004','authenticated','authenticated','c6-admin@nello.test','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000005','authenticated','authenticated','c6-pending@nello.test','x',now(),'{}','{}',now(),now());

insert into public.user_profiles(id, name, user_type, is_admin, is_active, email, phone) values
('91000000-0000-0000-0000-000000000001','Profissional C6','nutritionist',false,true,'c6-pro@nello.test','85999990001'),
('91000000-0000-0000-0000-000000000002','Estudante C6','nutritionist',false,true,'c6-student@nello.test',null),
('91000000-0000-0000-0000-000000000003','Paciente C6','patient',false,true,'c6-patient@nello.test',null),
('91000000-0000-0000-0000-000000000004','Admin C6','admin',true,true,'c6-admin@nello.test',null),
('91000000-0000-0000-0000-000000000005','Pendente C6','nutritionist',false,true,'c6-pending@nello.test',null);

update public.professional_verifications
set status = 'approved', professional_role = 'nutritionist',
    crn_region = 'CRN-3', crn_number = 'C6-0001', normalized_crn = 'CRN3C60001',
    valid_until = now() + interval '1 year'
where user_id = '91000000-0000-0000-0000-000000000001';

update public.professional_verifications
set status = 'approved', professional_role = 'student',
    verification_method = 'student_document_manual',
    crn_region = null, crn_number = null, normalized_crn = null,
    institution_name = 'Universidade C6', current_semester = 6,
    valid_until = now() + interval '6 months'
where user_id = '91000000-0000-0000-0000-000000000002';

update public.professional_verifications
set status = 'pending', professional_role = 'nutritionist',
    crn_region = null, crn_number = null, normalized_crn = null,
    valid_until = null
where user_id = '91000000-0000-0000-0000-000000000005';

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_result jsonb;
begin
  v_result := public.get_my_document_identity();
  if v_result->>'source' <> 'profile_default'
     or (v_result->>'version')::integer <> 0
     or (v_result->>'can_sign')::boolean is not true
     or v_result->>'normalized_crn' <> 'CRN3C60001' then
    raise exception 'c6_identity_default_projection_failed:%', v_result;
  end if;

  v_result := public.save_my_document_identity(
    jsonb_build_object(
      'professional_name', 'Dra. Profissional C6',
      'clinic_name', 'Clínica Nello C6',
      'professional_email', 'documentos@nello.test',
      'primary_color', '#123abc',
      'accent_color', '#AABBCC',
      'header_text', 'Nutrição clínica e acolhimento',
      'footer_text', 'Documento emitido com apoio da Nello'
    ),
    0,
    'configuração inicial'
  );
  if v_result->>'source' <> 'saved'
     or (v_result->>'version')::integer <> 1
     or v_result->>'professional_name' <> 'Dra. Profissional C6'
     or v_result->>'primary_color' <> '#123ABC'
     or v_result->>'normalized_crn' <> 'CRN3C60001' then
    raise exception 'c6_identity_first_save_failed:%', v_result;
  end if;

  v_result := public.save_my_document_identity(
    jsonb_build_object('clinic_name', 'Clínica Nello Atualizada'),
    1,
    'ajuste de consultório'
  );
  if (v_result->>'version')::integer <> 2
     or v_result->>'professional_name' <> 'Dra. Profissional C6'
     or v_result->>'clinic_name' <> 'Clínica Nello Atualizada' then
    raise exception 'c6_identity_partial_version_failed:%', v_result;
  end if;

  begin
    perform public.save_my_document_identity('{}'::jsonb, 1, 'versão obsoleta');
    raise exception 'c6_identity_stale_revision_accepted';
  exception when serialization_failure then null;
  end;

  begin
    perform public.save_my_document_identity('{"crn_number":"forjado"}'::jsonb, 2, 'forjar CRN');
    raise exception 'c6_identity_forged_crn_accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_my_document_identity('{"header_text":"<script>"}'::jsonb, 2, 'markup');
    raise exception 'c6_identity_markup_accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.professional_document_identities
      where professional_id = '91000000-0000-0000-0000-000000000001') <> 2
     or (select count(*) from public.professional_document_identities
         where professional_id = '91000000-0000-0000-0000-000000000001' and status = 'active') <> 1
     or (select count(*) from public.professional_document_identity_events
         where professional_id = '91000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'c6_identity_version_or_ledger_shape_failed';
  end if;

  if exists (
    select 1 from public.professional_document_identities
    where professional_id = '91000000-0000-0000-0000-000000000001'
      and (normalized_crn <> 'CRN3C60001' or verification_id is null)
  ) then
    raise exception 'c6_identity_crn_snapshot_not_authoritative';
  end if;

  begin
    delete from public.professional_document_identities
    where professional_id = '91000000-0000-0000-0000-000000000001';
    raise exception 'c6_identity_hard_delete_accepted';
  exception when raise_exception then
    if sqlerrm <> 'document_identity_delete_forbidden' then raise; end if;
  end;

  begin
    update public.professional_document_identity_events set reason = 'mutação';
    raise exception 'c6_identity_event_mutation_accepted';
  exception when raise_exception then
    if sqlerrm <> 'document_identity_events_are_immutable' then raise; end if;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
do $$
declare v_result jsonb;
begin
  v_result := public.get_my_document_identity();
  if (v_result->>'can_sign')::boolean is not false then
    raise exception 'c6_student_presented_as_signer';
  end if;
  begin
    perform public.save_my_document_identity('{}'::jsonb, 0, 'estudante');
    raise exception 'c6_student_identity_save_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000005', true);
do $$
declare v_result jsonb;
begin
  v_result := public.get_my_document_identity();
  if v_result->>'verification_status' <> 'pending'
     or (v_result->>'can_sign')::boolean is not false then
    raise exception 'c6_pending_identity_state_failed:%', v_result;
  end if;
  begin
    perform public.save_my_document_identity('{}'::jsonb, 0, 'pendente');
    raise exception 'c6_pending_identity_save_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.get_my_document_identity();
    raise exception 'c6_patient_identity_read_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);
do $$
begin
  begin
    perform public.get_my_document_identity();
    raise exception 'c6_admin_nonprofessional_identity_read_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.get_my_document_identity();
    raise exception 'c6_anon_identity_rpc_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
