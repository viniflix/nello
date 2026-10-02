begin;

do $$
declare
  v_count integer;
  v_names text[];
  v_legacy text[];
  v_definition text;
begin
  if has_schema_privilege('public', 'public', 'create')
     or has_schema_privilege('anon', 'public', 'create')
     or has_schema_privilege('authenticated', 'public', 'create') then
    raise exception 'c6_public_schema_create_reopened';
  end if;

  perform pg_temp.assert_client_rpc_surface();

  select array_agg(p.proname order by p.proname) into v_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute');
  if v_names is distinct from array['attach_anamnesis_file','claim_storage_upload','complete_anamnesis_revision','detach_anamnesis_file','get_anamnesis_by_token','get_anamnesis_draft_revision','reserve_storage_upload','save_anamnesis_draft_revision','submit_anamnesis_by_token','verify_document_authenticity']::text[] then
    raise exception 'c6_anon_security_definer_allowlist_drift:%', v_names;
  end if;

  select array_agg(p.proname order by p.proname) into v_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('public', p.oid, 'execute');
  if v_names is distinct from array['verify_document_authenticity']::text[] then
    raise exception 'c6_public_security_definer_allowlist_drift:%', v_names;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting like 'search_path=%'
      )
  ) then
    raise exception 'c6_security_definer_without_pinned_search_path';
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into v_legacy
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
    )
    and p.proconfig is distinct from array['search_path=""']::text[];

  if v_legacy is distinct from array['end_care_episode(uuid,text)','extract_and_inject_clinical_flags(uuid)','generate_anamnesis_link(uuid,uuid,integer)','get_anamnesis_by_token(uuid)','get_care_patient_profile(uuid)','get_empty_patient_removal_status(uuid)','get_my_care_relationship()','link_checkin_template(uuid,uuid,text,text)','list_nutritionist_care_patients()','process_patient_reminders(uuid)','refund_financial_transaction(bigint,date)','remove_empty_patient(uuid)','save_patient_diary_meal(bigint,jsonb,jsonb)','set_checkin_schedule_active(uuid,boolean)','submit_anamnesis_by_token(uuid,jsonb,text,boolean,text,jsonb)','submit_checkin_session(uuid,jsonb)']::text[] then
    raise exception 'c6_legacy_search_path_allowlist_drift:%', v_legacy;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
      and pg_get_functiondef(p.oid) !~ 'auth\.uid\(\)'
      and p.oid::regprocedure::text <> all(array['admin_brand_migration_status()','admin_list_people(text,text,integer)','admin_security_overview()','admin_workflow_overview()','check_is_admin()','clone_diet_template_to_patient(uuid,uuid,uuid,text)','end_care_episode(uuid,text)','get_admin_dashboard_stats()','get_anamnesis_by_token(uuid)','get_anamnesis_draft_revision(uuid)','save_anamnesis_draft_revision(uuid,jsonb,boolean,timestamp with time zone)','complete_anamnesis_revision(uuid,jsonb,boolean,timestamp with time zone,uuid)','get_empty_patient_removal_status(uuid)','get_nutritionist_detail(uuid)','get_nutritionists_list()','get_system_live_logs(integer)','get_tcc_study_metrics()','import_diet_template_meals_to_plan(uuid,bigint,uuid[])','is_admin()','list_data_subject_requests(text)','list_professional_verifications(text,text)','request_student_supervision_by_email(text)','submit_anamnesis_by_token(uuid,jsonb,text,boolean,text,jsonb)','upsert_full_meal_plan(bigint,jsonb,jsonb)','verify_document_authenticity(uuid)']::text[])
  ) then
    raise exception 'c6_unreviewed_indirect_guard_added';
  end if;

  foreach v_definition in array array['get_anamnesis_draft_revision(uuid)','save_anamnesis_draft_revision(uuid,jsonb,boolean,timestamp with time zone)','complete_anamnesis_revision(uuid,jsonb,boolean,timestamp with time zone,uuid)'] loop
    if pg_get_functiondef(('public.'||v_definition)::regprocedure) !~ 'public\.get_anamnesis_by_token\(p_token\)' then
      raise exception 'c6_anamnesis_capability_wrapper_guard_drift:%',v_definition;
    end if;
  end loop;

  select pg_get_functiondef('public.end_care_episode(uuid,text)'::regprocedure)
  into v_definition;
  if v_definition !~ 'private\.end_care_episode' then
    raise exception 'c6_end_episode_wrapper_guard_drift';
  end if;

  select pg_get_functiondef('public.get_empty_patient_removal_status(uuid)'::regprocedure)
  into v_definition;
  if v_definition !~ 'private\.empty_patient_removal_status' then
    raise exception 'c6_empty_patient_wrapper_guard_drift';
  end if;

  select pg_get_functiondef('public.list_professional_verifications(text,text)'::regprocedure)
  into v_definition;
  if v_definition !~ 'private\.is_admin\(\)' then
    raise exception 'c6_verification_admin_guard_drift';
  end if;

  select pg_get_functiondef('public.request_student_supervision_by_email(text)'::regprocedure)
  into v_definition;
  if v_definition !~ 'public\.request_student_supervision' then
    raise exception 'c6_supervision_wrapper_guard_drift';
  end if;

  select pg_get_functiondef('public.get_anamnesis_by_token(uuid)'::regprocedure)
  into v_definition;
  if v_definition !~ 'public_access_token = p_token'
     or v_definition !~ 'token_expires_at'
     or v_definition !~ 'completed.*validated' then
    raise exception 'c6_public_anamnesis_read_guard_drift';
  end if;

  select pg_get_functiondef(
    'public.submit_anamnesis_by_token(uuid,jsonb,text,boolean,text,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition !~ 'public_access_token[[:space:]]*=[[:space:]]*p_token'
     or v_definition !~ 'token_expires_at'
     or v_definition !~ 'LGPD_CONSENT_REQUIRED' then
    raise exception 'c6_public_anamnesis_submit_guard_drift';
  end if;
end;
$$;

rollback;
