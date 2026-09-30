begin;

-- C2 contract matrix. The runner owns personas and applies B0-C2 before this file.
-- This matrix intentionally describes the repaired contract, so Task 1 must be RED
-- including atomic creation, revision control and immutable template snapshots.

delete from public.student_supervisions
where student_id = '10000000-0000-0000-0000-000000000044';

insert into public.student_supervisions(
  student_id, supervisor_id, status, requested_at, responded_at, started_at
) values (
  '10000000-0000-0000-0000-000000000044',
  '10000000-0000-0000-0000-000000000041',
  'active', now(), now(), now()
);

-- 1. Fixture integrity -------------------------------------------------------

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
  from public.professional_verifications
  where user_id in (
    '10000000-0000-0000-0000-000000000041',
    '10000000-0000-0000-0000-000000000042',
    '10000000-0000-0000-0000-000000000043'
  ) and (
    professional_role <> 'nutritionist'
    or status <> 'approved'
    or crn_number <> '9000' || right(user_id::text,2)
    or crn_region <> 'CRN-3'
    or valid_until <= now()
    or reviewed_at is null
  );
  if v_bad <> 0 or (select count(*) from public.professional_verifications
    where user_id in ('10000000-0000-0000-0000-000000000041',
      '10000000-0000-0000-0000-000000000042','10000000-0000-0000-0000-000000000043')) <> 3 then
    raise exception 'invalid_nutritionist_fixture: %', v_bad;
  end if;

  if not exists (
    select 1 from public.professional_verifications
    where user_id = '10000000-0000-0000-0000-000000000044'
      and professional_role = 'student'
      and status = 'approved'
      and valid_until > now()
      and reviewed_at is not null
  ) then
    raise exception 'invalid_student_fixture';
  end if;

  if not exists (
    select 1 from public.student_supervisions
    where student_id = '10000000-0000-0000-0000-000000000044'
      and supervisor_id = '10000000-0000-0000-0000-000000000041'
      and status = 'active'
  ) then
    raise exception 'invalid_supervision_fixture';
  end if;

  raise notice 'PASS: C2 fixtures are clinically capable';
end $$;

-- 2. Template baseline and immutable versions -------------------------------

do $$
declare t_count integer; v_count integer;
begin
  select count(*) into t_count
  from public.clinical_evolution_templates
  where category = 'system' and is_active;
  if t_count < 8 then
    raise exception 'expected at least 8 system templates, got %', t_count;
  end if;

  select count(*) into v_count
  from public.clinical_evolution_template_versions;
  if v_count < t_count then
    raise exception 'expected at least % template versions, got %', t_count, v_count;
  end if;

  raise notice 'PASS: template baseline and version snapshots exist';
end $$;

-- 3. Repaired RPC surface and grants (first expected RED) --------------------

do $$
declare sig text;
begin
  foreach sig in array array[
    'create_clinical_evolution_draft(uuid,uuid,text,timestamp with time zone,text,text)',
    'update_clinical_record_draft(uuid,jsonb,text,bigint)',
    'finalize_clinical_record(uuid,jsonb,bigint,text)',
    'sign_clinical_record(uuid)',
    'list_clinical_records_by_episode(uuid,uuid,text)',
    'list_evolution_templates()',
    'clone_evolution_template(text,text)',
    'version_private_evolution_template(text,jsonb)',
    'archive_private_evolution_template(text)'
  ] loop
    if to_regprocedure('public.' || sig) is null then
      raise exception 'rpc_missing: %', sig;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.' || sig)
        and p.prosecdef
        and p.proconfig = array['search_path=""']
    ) then
      raise exception 'rpc_not_hardened: %', sig;
    end if;
    if has_function_privilege('public', 'public.' || sig, 'execute')
      or has_function_privilege('anon', 'public.' || sig, 'execute')
      or not has_function_privilege('authenticated', 'public.' || sig, 'execute') then
      raise exception 'rpc_grant_failed: %', sig;
    end if;
  end loop;

  if to_regprocedure('public.cosign_clinical_record(uuid)') is not null then
    raise exception 'cosign_definition_must_be_removed';
  end if;

  if pg_get_functiondef(to_regprocedure(
    'public.create_clinical_evolution_draft(uuid,uuid,text,timestamp with time zone,text,text)'
  )) !~* 'for[[:space:]]+share' then
    raise exception 'draft_creation_must_lock_template_snapshot';
  end if;
  foreach sig in array array[
    'update_clinical_record_draft(uuid,jsonb,text,bigint)',
    'finalize_clinical_record(uuid,jsonb,bigint,text)',
    'sign_clinical_record(uuid)'
  ] loop
    if pg_get_functiondef(to_regprocedure('public.' || sig))
      !~* 'care_episodes[[:space:][:alnum:]_.]*.*for[[:space:]]+share' then
      raise exception 'episode_lock_required: %',sig;
    end if;
  end loop;

  raise notice 'PASS: repaired C2 RPC surface and grants';
end $$;

do $$
declare v_other jsonb;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );
  begin
    perform public.create_clinical_record_draft(
      '20000000-0000-0000-0000-000000000041',
      'clinical_evolution', now(), 'professional_private'
    );
    raise exception 'legacy_evolution_constructor_should_fail';
  exception when others then
    if sqlerrm not like '%specialized_evolution_draft_required%' then raise; end if;
  end;
  v_other:=public.create_clinical_record_draft(
    '20000000-0000-0000-0000-000000000041',
    'follow_up', now(), 'professional_private'
  );
  if v_other->>'record_type'<>'follow_up' then
    raise exception 'generic_constructor_must_remain_available_for_other_types';
  end if;
  reset role;
  raise notice 'PASS: legacy constructor cannot bypass C2 snapshots';
end $$;

-- 4. Template version rows are immutable ------------------------------------

do $$
begin
  begin
    update public.clinical_evolution_template_versions
    set sections_snapshot = '[{"key":"tamper"}]'::jsonb
    where template_code = 'nello_standard';
    raise exception 'template_version_update_should_fail';
  exception when others then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;

  begin
    delete from public.clinical_evolution_template_versions
    where template_code = 'nello_standard';
    raise exception 'template_version_delete_should_fail';
  exception when others then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;
  raise notice 'PASS: template versions are immutable';
end $$;

-- 5. Atomic creation freezes template/version and starts revision ------------

do $$
declare v_draft jsonb;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  v_draft := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now(), 'professional_private', null
  );
  if v_draft->>'status' <> 'draft' then raise exception 'draft_status_expected'; end if;
  if v_draft->>'template_code' <> 'nello_standard' then raise exception 'template_code_not_frozen'; end if;
  if (v_draft->>'template_version')::integer < 1 then raise exception 'template_version_not_frozen'; end if;
  if (v_draft->>'revision')::bigint <> 1 then raise exception 'initial_revision_must_be_one'; end if;
  if v_draft->'template_sections_snapshot' is distinct from (
    select v.sections_snapshot
    from public.clinical_evolution_template_versions v
    where v.template_code=v_draft->>'template_code'
      and v.version=(v_draft->>'template_version')::integer
  ) then raise exception 'draft_template_snapshot_projection_missing'; end if;

  reset role;
  raise notice 'PASS: atomic draft creation freezes template version';
end $$;

-- 5b. Every record-returning C2 RPC projects the exact frozen snapshot -------

do $$
declare
  v_draft jsonb;
  v_result jsonb;
  v_listed jsonb;
  v_generic jsonb;
  v_id uuid;
  v_revision bigint;
  v_expected_snapshot jsonb;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  v_draft := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now(), 'professional_private', null
  );
  v_id := (v_draft->>'id')::uuid;
  v_revision := (v_draft->>'revision')::bigint;
  select v.sections_snapshot into v_expected_snapshot
  from public.clinical_evolution_template_versions v
  where v.template_code=v_draft->>'template_code'
    and v.version=(v_draft->>'template_version')::integer;

  if v_draft->'template_sections_snapshot' is distinct from v_expected_snapshot then
    raise exception 'create_snapshot_projection_missing';
  end if;

  v_result := public.update_clinical_record_draft(
    v_id, '{"conduct":"Conteúdo para testar a projeção"}'::jsonb,
    'professional_private', v_revision
  );
  if v_result->'template_sections_snapshot' is distinct from v_expected_snapshot then
    raise exception 'update_snapshot_projection_missing';
  end if;

  v_revision := (v_result->>'revision')::bigint;
  v_result := public.finalize_clinical_record(
    v_id, '{"conduct":"Conteúdo para testar a projeção"}'::jsonb,
    v_revision, null
  );
  if v_result->'template_sections_snapshot' is distinct from v_expected_snapshot then
    raise exception 'finalize_snapshot_projection_missing';
  end if;

  v_result := public.sign_clinical_record(v_id);
  if v_result->'template_sections_snapshot' is distinct from v_expected_snapshot then
    raise exception 'sign_snapshot_projection_missing';
  end if;

  select listed into v_listed
  from public.list_clinical_records_by_episode(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043', null
  ) listed
  where listed->>'id'=v_id::text;
  if v_listed->'template_sections_snapshot' is distinct from v_expected_snapshot then
    raise exception 'list_snapshot_projection_missing';
  end if;

  select listed into v_generic
  from public.list_clinical_records_by_episode(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043', null
  ) listed
  where listed->>'record_type'='follow_up'
  limit 1;
  if v_generic is null then
    raise exception 'generic_record_lost_from_list_projection';
  end if;
  if not (v_generic ? 'template_sections_snapshot')
    or v_generic->'template_sections_snapshot' <> 'null'::jsonb then
    raise exception 'generic_record_snapshot_must_be_explicit_null';
  end if;

  if exists(
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='clinical_records'
      and c.column_name='template_sections_snapshot'
  ) then raise exception 'snapshot_must_not_be_duplicated_in_clinical_records'; end if;

  reset role;
  raise notice 'PASS: every C2 record RPC projects the exact frozen template snapshot';
end $$;

-- 5a. Template sections are validated by the server -------------------------

do $$
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  begin
    perform public.version_private_evolution_template(
      'nello_standard',
      '[{"key":"duplicate","label":"Primeira","required":false},{"key":"duplicate","label":"Segunda","required":false}]'::jsonb
    );
    raise exception 'system_template_version_should_fail';
  exception when others then
    if sqlerrm not like '%private_template_owner_required%' then raise; end if;
  end;

  begin
    perform public.clone_evolution_template('nello_standard', 'X');
    raise exception 'short_private_template_name_should_fail';
  exception when others then
    if sqlerrm not like '%invalid_template_name%' then raise; end if;
  end;

  reset role;
  raise notice 'PASS: template RPCs validate ownership and names';
end $$;

-- 5b. Private templates are owned, versioned and archived through RPCs ------

do $$
declare v_clone jsonb; v_version jsonb; v_archived jsonb; v_code text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  v_clone := public.clone_evolution_template('nello_standard', 'Meu acompanhamento');
  v_code := v_clone->>'code';
  if v_code !~ '^private_[0-9a-f]{8}_[0-9a-f]{32}$'
    or v_clone->>'category' <> 'private'
    or v_clone->>'owner_id' <> '10000000-0000-0000-0000-000000000041'
    or (v_clone->>'current_version')::integer <> 1 then
    raise exception 'private_clone_contract_failed: %', v_clone;
  end if;

  begin
    perform public.version_private_evolution_template(
      v_code,
      '[{"key":"bad key","label":"InvÃ¡lida","required":false}]'::jsonb
    );
    raise exception 'invalid_section_key_should_fail';
  exception when others then
    if sqlerrm not like '%invalid_template_sections%' then raise; end if;
  end;

  v_version := public.version_private_evolution_template(
    v_code,
    '[{"key":"conduct","label":"Conduta revisada","hint":"Nova estrutura","required":true}]'::jsonb
  );
  if (v_version->>'version')::integer <> 2 then
    raise exception 'private_template_version_must_increment: %', v_version;
  end if;

  reset role;
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000043', true
  );
  begin
    perform public.archive_private_evolution_template(v_code);
    raise exception 'unrelated_template_archive_should_fail';
  exception when others then
    if sqlerrm not like '%private_template_owner_required%' then raise; end if;
  end;

  reset role;
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );
  v_archived := public.archive_private_evolution_template(v_code);
  if (v_archived->>'is_active')::boolean is distinct from false then
    raise exception 'private_template_archive_failed: %', v_archived;
  end if;

  if not exists (
    select 1 from public.clinical_evolution_template_events
    where template_code=v_code and action in ('created','versioned','archived')
    group by template_code having count(*)=3
  ) then
    raise exception 'private_template_audit_trail_incomplete';
  end if;

  reset role;
  raise notice 'PASS: private template lifecycle is isolated and audited';
end $$;

-- 5c. Authenticated clients cannot mutate template tables directly ----------

do $$
begin
  if has_table_privilege('authenticated','public.clinical_evolution_templates','insert')
    or has_table_privilege('authenticated','public.clinical_evolution_templates','update')
    or has_table_privilege('authenticated','public.clinical_evolution_templates','delete')
    or has_table_privilege('authenticated','public.clinical_evolution_template_versions','insert')
    or has_table_privilege('authenticated','public.clinical_evolution_template_versions','update')
    or has_table_privilege('authenticated','public.clinical_evolution_template_versions','delete') then
    raise exception 'authenticated_template_direct_mutation_grant_found';
  end if;
  raise notice 'PASS: template mutation is RPC-only';
end $$;

-- 5d. Creation is isolated and supervision capacity is current --------------

do $$
declare v_actor uuid; v_draft jsonb;
begin
  foreach v_actor in array array[
    '20000000-0000-0000-0000-000000000041'::uuid,
    '10000000-0000-0000-0000-000000000042'::uuid,
    '10000000-0000-0000-0000-000000000043'::uuid
  ] loop
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    begin
      perform public.create_clinical_evolution_draft(
        '20000000-0000-0000-0000-000000000041',
        '40000000-0000-0000-0000-000000000043',
        'nello_standard',now(),'professional_private',null
      );
      raise exception 'unrelated_episode_creation_should_fail';
    exception when insufficient_privilege then null;
    when others then
      if sqlerrm not like '%episode_write_forbidden%' then raise; end if;
    end;
    reset role;
  end loop;

  -- B4 requires a student-owned episode; a supervisor-owned episode is not writable by the student.
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000045','authenticated','authenticated','student-patient-c2@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now());
  insert into public.care_episodes(id,patient_id,nutritionist_id,status,start_reason,started_by) values
  ('40000000-0000-0000-0000-000000000045','20000000-0000-0000-0000-000000000045','10000000-0000-0000-0000-000000000044','active','student QA','10000000-0000-0000-0000-000000000044');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000044',true);
  v_draft:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000045',
    '40000000-0000-0000-0000-000000000045',
    'nello_standard',now(),'professional_private',null
  );
  if v_draft->>'student_id'<>'10000000-0000-0000-0000-000000000044'
    or v_draft->>'supervisor_id'<>'10000000-0000-0000-0000-000000000041'
    or v_draft->>'author_id'<>'10000000-0000-0000-0000-000000000044' then
    raise exception 'student_authorship_resolution_failed';
  end if;
  reset role;

  update public.professional_verifications set valid_until=now()-interval '1 day'
  where user_id='10000000-0000-0000-0000-000000000041';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000044',true);
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000045',
      '40000000-0000-0000-0000-000000000045',
      'nello_standard',now(),'professional_private',null
    );
    raise exception 'expired_supervisor_creation_should_fail';
  exception when insufficient_privilege then null;
  when others then
    if sqlerrm not like '%active_supervisor_required%' then raise; end if;
  end;
  reset role;
  update public.professional_verifications set valid_until=now()+interval '1 year'
  where user_id='10000000-0000-0000-0000-000000000041';

  raise notice 'PASS: creation isolation and current supervision capacity';
end $$;

-- 5e. Retrospective reason bounds are enforced at creation ------------------

do $$
declare v_draft jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',
      'nello_standard',now()-interval '1 day','professional_private','123456789'
    );
    raise exception 'short_retrospective_reason_should_fail';
  exception when others then
    if sqlerrm not like '%retrospective_reason_required%' then raise; end if;
  end;
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',
      'nello_standard',now()-interval '1 day','professional_private',repeat('x',501)
    );
    raise exception 'long_retrospective_reason_should_fail';
  exception when others then
    if sqlerrm not like '%retrospective_reason_required%' then raise; end if;
  end;
  v_draft:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',
    'nello_standard',now()-interval '1 day','professional_private','Motivo clÃ­nico vÃ¡lido'
  );
  if v_draft->>'retrospective_reason'<>'Motivo clÃ­nico vÃ¡lido' then
    raise exception 'valid_retrospective_reason_not_preserved';
  end if;
  reset role;
  raise notice 'PASS: retrospective reason uses 10-500 bounds';
end $$;

-- 5f. Full section validation, owner isolation and archive behavior ----------

do $$
declare v_clone jsonb; v_code text; v_invalid jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
  v_clone:=public.clone_evolution_template('nello_standard','ValidaÃ§Ã£o completa');
  v_code:=v_clone->>'code';

  foreach v_invalid in array array[
    '[]'::jsonb,
    (select jsonb_agg(jsonb_build_object('key','k'||n,'label','Campo','required',false)) from generate_series(1,21)n),
    '[{"key":"duplicate","label":"Campo A","required":false},{"key":"duplicate","label":"Campo B","required":false}]'::jsonb,
    '[{"key":"bad key","label":"Campo","required":false}]'::jsonb,
    jsonb_build_array(jsonb_build_object('key','valid','label','X','required',false)),
    jsonb_build_array(jsonb_build_object('key','valid','label','Campo','hint',repeat('h',301),'required',false)),
    '[{"key":"valid","label":"Campo","required":"false"}]'::jsonb,
    '[{"key":"valid","label":"Campo","required":false,"extra":true}]'::jsonb
  ] loop
    begin
      perform public.version_private_evolution_template(v_code,v_invalid);
      raise exception 'invalid_template_sections_should_fail';
    exception when others then
      if sqlerrm not like '%invalid_template_sections%' then raise; end if;
    end;
  end loop;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000044',true);
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000045','40000000-0000-0000-0000-000000000045',
      v_code,now(),'professional_private',null
    );
    raise exception 'other_owner_private_template_should_fail';
  exception when others then
    if sqlerrm not like '%active_template_required%' then raise; end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
  perform public.archive_private_evolution_template(v_code);
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',
      v_code,now(),'professional_private',null
    );
    raise exception 'archived_private_template_should_fail';
  exception when others then
    if sqlerrm not like '%active_template_required%' then raise; end if;
  end;
  reset role;
  raise notice 'PASS: full template validation and private isolation';
end $$;

-- 5g. Service role can satisfy template CHECK constraints -------------------

do $$
begin
  set local role service_role;
  insert into public.clinical_evolution_templates(code,name,category,owner_id,sections)
  values('private_service_probe','Service probe','private','10000000-0000-0000-0000-000000000041',
    '[{"key":"conduct","label":"Conduta","required":true}]'::jsonb);
  insert into public.clinical_evolution_template_versions(template_code,version,sections_snapshot,created_by)
  values('private_service_probe',1,'[{"key":"conduct","label":"Conduta","required":true}]'::jsonb,
    '10000000-0000-0000-0000-000000000041');
  reset role;
  raise notice 'PASS: service role can create controlled template versions';
end $$;

-- 6. Payload validation and compare-and-swap ---------------------------------

do $$
declare v_draft jsonb; v_id uuid; v_revision bigint;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );
  v_draft := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now(), 'professional_private', null
  );
  v_id := (v_draft->>'id')::uuid;
  v_revision := (v_draft->>'revision')::bigint;

  begin
    perform public.finalize_clinical_record(
      v_id, '{"conduct":"<p>&nbsp;</p>"}'::jsonb, v_revision, null
    );
    raise exception 'html_empty_should_fail';
  exception when others then
    if sqlerrm not like '%content_minimum_required%' then raise; end if;
  end;

  begin
    perform public.update_clinical_record_draft(
      v_id, '{"unknown_key":"not allowed"}'::jsonb,
      'professional_private', v_revision
    );
    raise exception 'unknown_section_should_fail';
  exception when others then
    if sqlerrm not like '%unknown_template_section%' then raise; end if;
  end;

  begin
    perform public.update_clinical_record_draft(
      v_id, jsonb_build_object('conduct', repeat('x', 50001)),
      'professional_private', v_revision
    );
    raise exception 'oversized_section_should_fail';
  exception when others then
    if sqlerrm not like '%section_content_too_large%' then raise; end if;
  end;

  begin
    perform public.update_clinical_record_draft(
      v_id, jsonb_build_object(
        'context', repeat('a', 50000), 'subjective', repeat('b', 50000),
        'objective', repeat('c', 50000), 'assessment', repeat('d', 50000),
        'evolution', repeat('e', 50000), 'adherence', repeat('f', 50000),
        'conduct', repeat('g', 50000), 'goals', repeat('h', 50000),
        'follow_up', repeat('i', 50000), 'alerts', repeat('j', 50000),
        'sources', repeat('k', 50000)
      ), 'professional_private', v_revision
    );
    raise exception 'oversized_payload_should_fail';
  exception when others then
    if sqlerrm not like '%content_payload_too_large%' then raise; end if;
  end;

  v_draft := public.update_clinical_record_draft(
    v_id, '{"conduct":"Primeiro salvamento"}'::jsonb,
    'professional_private', v_revision
  );
  if (v_draft->>'revision')::bigint <> v_revision + 1 then
    raise exception 'revision_must_increment';
  end if;

  begin
    perform public.update_clinical_record_draft(
      v_id, '{"conduct":"Segundo salvamento concorrente"}'::jsonb,
      'professional_private', v_revision
    );
    raise exception 'stale_revision_should_fail';
  exception when sqlstate '40001' then
    if sqlerrm not like '%draft_revision_conflict%' then raise; end if;
  end;

  reset role;
  raise notice 'PASS: validation and draft_revision_conflict';
end $$;

-- 7. Retroactivity is evaluated against created_at --------------------------

do $$
declare v_draft jsonb; v_id uuid; v_revision bigint;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000041',
      '40000000-0000-0000-0000-000000000043',
      'nello_standard', now() - interval '1 day', 'professional_private', null
    );
    raise exception 'retrospective_creation_without_reason_should_fail';
  exception when others then
    if sqlerrm not like '%retrospective_reason_required%' then raise; end if;
  end;

  v_draft := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now() - interval '4 minutes', 'professional_private', null
  );
  v_id := (v_draft->>'id')::uuid;
  v_revision := (v_draft->>'revision')::bigint;
  reset role;
  update public.clinical_records set created_at = now() - interval '10 minutes'
  where id = v_id;
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );

  perform public.finalize_clinical_record(
    v_id, '{"conduct":"Finaliza sem falsa retroatividade"}'::jsonb,
    v_revision, null
  );

  reset role;
  raise notice 'PASS: retroactivity uses created_at';
end $$;

-- 8. Canonical hash covers context, not only content -------------------------

do $$
declare a jsonb; b jsonb; a_id uuid; b_id uuid; a_hash text; b_hash text;
  a_canonical jsonb; b_canonical jsonb; a_expected text; b_expected text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );
  a := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now(), 'professional_private', null
  );
  b := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000041',
    '40000000-0000-0000-0000-000000000043',
    'nello_standard', now(), 'shared_with_patient', null
  );
  a_id := (a->>'id')::uuid; b_id := (b->>'id')::uuid;
  a := public.finalize_clinical_record(
    a_id, '{"conduct":"Mesmo conteúdo"}'::jsonb, (a->>'revision')::bigint, null
  );
  b := public.finalize_clinical_record(
    b_id, '{"conduct":"Mesmo conteúdo"}'::jsonb, (b->>'revision')::bigint, null
  );
  a_hash := a->>'canonical_hash'; b_hash := b->>'canonical_hash';
  a_canonical:=jsonb_build_object(
    'record_id',a->'id','patient_id',a->'patient_id',
    'care_episode_id',a->'care_episode_id','nutritionist_id',a->'nutritionist_id',
    'author_id',a->'author_id','student_id',a->'student_id',
    'supervisor_id',a->'supervisor_id','record_type',a->'record_type',
    'template_code',a->'template_code','template_version',a->'template_version',
    'encounter_at',a->'encounter_at','visibility',a->'visibility',
    'content',a->'content','retrospective_reason',a->'retrospective_reason'
  );
  b_canonical:=jsonb_build_object(
    'record_id',b->'id','patient_id',b->'patient_id',
    'care_episode_id',b->'care_episode_id','nutritionist_id',b->'nutritionist_id',
    'author_id',b->'author_id','student_id',b->'student_id',
    'supervisor_id',b->'supervisor_id','record_type',b->'record_type',
    'template_code',b->'template_code','template_version',b->'template_version',
    'encounter_at',b->'encounter_at','visibility',b->'visibility',
    'content',b->'content','retrospective_reason',b->'retrospective_reason'
  );
  a_expected:=encode(extensions.digest(convert_to(a_canonical::text,'UTF8'),'sha256'),'hex');
  b_expected:=encode(extensions.digest(convert_to(b_canonical::text,'UTF8'),'sha256'),'hex');
  if a_hash<>a_expected or b_hash<>b_expected or a_hash=b_hash then
    raise exception 'canonical_hash_must_cover_visibility_and_context';
  end if;
  reset role;

  begin
    update public.clinical_records set author_id='10000000-0000-0000-0000-000000000042'
    where id=a_id;
    raise exception 'finalized_authorship_mutation_should_fail';
  exception when check_violation then
    if sqlerrm not like '%finalized_record_content_immutable%' then raise; end if;
  end;
  begin
    update public.clinical_records set canonical_hash=repeat('0',64) where id=a_id;
    raise exception 'finalized_hash_mutation_should_fail';
  exception when check_violation then
    if sqlerrm not like '%finalized_record_content_immutable%' then raise; end if;
  end;
  begin
    update public.clinical_records set signed_at=now() where id=a_id;
    raise exception 'out_of_transition_signed_at_should_fail';
  exception when check_violation then
    if sqlerrm not like '%finalized_record_content_immutable%' then raise; end if;
  end;
  raise notice 'PASS: canonical hash covers record context';
end $$;

-- 9. Student -> supervisor is a single professional signature ---------------

do $$
declare v_draft jsonb; v_id uuid; v_revision bigint; v_result jsonb;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000044', true
  );
  v_draft := public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000045',
    '40000000-0000-0000-0000-000000000045',
    'nello_standard', now(), 'professional_private', null
  );
  v_id := (v_draft->>'id')::uuid;
  v_revision := (v_draft->>'revision')::bigint;
  if v_draft->>'student_id' <> '10000000-0000-0000-0000-000000000044'
    or v_draft->>'supervisor_id' <> '10000000-0000-0000-0000-000000000041' then
    raise exception 'student_authorship_not_resolved';
  end if;

  v_draft := public.update_clinical_record_draft(
    v_id, '{"conduct":"Rascunho do estudante"}'::jsonb,
    'professional_private', v_revision
  );
  v_revision := (v_draft->>'revision')::bigint;

  begin
    perform public.finalize_clinical_record(
      v_id, '{"conduct":"Rascunho do estudante"}'::jsonb, v_revision, null
    );
    raise exception 'student_finalize_should_fail';
  exception when sqlstate '42501' then
    if sqlerrm not like '%supervisor_required_to_finalize%' then raise; end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config(
    'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true
  );
  v_draft := public.update_clinical_record_draft(
    v_id, '{"conduct":"Revisado pelo supervisor"}'::jsonb,
    'professional_private', v_revision
  );
  v_result := public.finalize_clinical_record(
    v_id, '{"conduct":"Revisado pelo supervisor"}'::jsonb,
    (v_draft->>'revision')::bigint, null
  );
  v_result := public.sign_clinical_record(v_id);
  if v_result->>'status' <> 'signed' then
    raise exception 'supervisor_signature_expected';
  end if;

  reset role; -- Audit tables deliberately remain unavailable to client roles.
  if not exists(
    select 1 from public.clinical_record_events e
    where e.clinical_record_id=v_id and e.from_status='finalized' and e.to_status='signed'
      and e.actor_id='10000000-0000-0000-0000-000000000041'
      and e.metadata ?& array['canonical_hash','crn_number','crn_region','signed_at','auth_level']
      and not (e.metadata ?| array['content','clinical_content','student_author'])
      and e.metadata->>'canonical_hash'=v_result->>'canonical_hash'
      and e.metadata->>'crn_number'='12345' and e.metadata->>'crn_region'='CRN-3'
      and (select count(*) from jsonb_object_keys(e.metadata))=5
  ) then
    raise exception 'signature_event_metadata_invalid';
  end if;
  set local role authenticated;

  begin
    perform public.sign_clinical_record(v_id);
    raise exception 'second_signature_should_fail';
  exception when sqlstate '23514' then
    if sqlerrm not like '%only_finalized_records_can_be_signed%' then raise; end if;
  end;

  reset role;
  begin
    update public.clinical_records set status='draft' where id=v_id;
    raise exception 'signed_record_reopen_should_fail';
  exception when sqlstate '23514' then
    if sqlerrm not like '%invalid_clinical_record_status_transition%' then raise; end if;
  end;
  raise notice 'PASS: student edit, supervisor finalize and single signature';
end $$;

do $$ begin
  raise notice '=== ALL C2 CONTRACT MATRIX TESTS PASSED ===';
end $$;
rollback;
